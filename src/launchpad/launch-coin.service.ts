import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { calculateWithSlippageBuy, PumpFunSDK } from 'pumpdotfun-sdk';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { NftPrimaryCoin } from '../shared/mongo/types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Injectable()
export class LaunchCoinService {
  private isProcessing = false;
  private connection: Connection;
  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly elizaManager: ElizaManagerService,
    private readonly logger: TransientLoggerService,
  ) {
    this.logger.setContext(LaunchCoinService.name);
    this.connection = new Connection(
      this.config.get<string>('SOLANA_RPC_URL')!,
    );
  }

  // @Interval(60 * 1000)
  async launchCoins() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      const coins = await this.mongo.nftPrimaryCoins
        .find({
          chain: 'solana',
          created: false,
          // we assume that if coin is not created in the last 7 days, the NFT is not created
          createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        })
        .toArray();

      for (const coin of coins) {
        try {
          await this.launchCoin(coin);
        } catch (e) {
          this.logger.error(`Failed to launch coin ${coin.nftId}: ${e}`);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async launchCoin(coin: NftPrimaryCoin) {
    this.logger.log(`Launch coin for nftId: ${coin.nftId}`);

    if (!(await this.checkIfNftIndexed(coin.nftId))) {
      this.logger.log(`NFT ${coin.nftId} not indexed, skipping`);
      return;
    }

    if (await this.checkIfCoinCreated(coin)) {
      this.logger.log(`Coin ${coin.nftId} already created, skipping`);
      await this.markCoinAsCreated(coin);
      return;
    }

    // get signer keypairs
    const mintKeypair = Keypair.fromSecretKey(bs58.decode(coin.mintSecretKey));
    const { solanaKeypair: agentKeypair } =
      await this.elizaManager.getAgentAccountKeypair(coin.chain, coin.nftId);

    // check if agent has enough balance
    const balance = await this.connection.getBalance(agentKeypair.publicKey);
    this.logger.log(`Agent account balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    const neededBalance = (0.02 + coin.initialBuyAmountSol) * LAMPORTS_PER_SOL;
    if (balance < neededBalance) {
      throw new Error(
        `Agent does not have enough balance, balance: ${balance / LAMPORTS_PER_SOL}, needed: ${neededBalance / LAMPORTS_PER_SOL}`,
      );
    }

    // create token
    const { instructions, metadataUri } =
      await this.constructCreateCoinInstructions({
        metadataUri: coin.metadataUri,
        creator: agentKeypair.publicKey.toBase58(),
        token: {
          name: coin.coinInfo.name,
          symbol: coin.coinInfo.symbol,
          description: coin.coinInfo.description,
          file: new Blob([Buffer.from(coin.coinInfo.file, 'base64')]),
          twitter: coin.coinInfo.twitter,
          telegram: coin.coinInfo.telegram,
          website: coin.coinInfo.website,
        },
        buyAmountSol: coin.initialBuyAmountSol,
        mint: mintKeypair,
      });

    // save metadata uri in case we need to retry
    await this.setMetadataUri(coin, metadataUri);

    // build and send transaction
    const latestBlockhash = await this.connection.getLatestBlockhash();

    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: agentKeypair.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message(),
    );

    transaction.sign([agentKeypair, mintKeypair]);

    this.logger.log('Sending transaction');
    const txid = await this.connection.sendTransaction(transaction);
    this.logger.log(`Transaction sent, txid: ${txid}`);
    const confirmation = await this.connection.confirmTransaction({
      signature: txid,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    await this.markCoinAsCreated(coin);
    this.logger.log(`Coin ${coin.nftId} created, txid: ${txid}`);
    return txid;
  }

  async constructCreateCoinInstructions({
    creator,
    token,
    metadataUri,
    buyAmountSol,
    mint,
  }: {
    creator: string;
    token: {
      name: string;
      symbol: string;
      description: string;
      file: Blob;
      twitter?: string;
      telegram?: string;
      website?: string;
    };
    metadataUri?: string;
    buyAmountSol: number;
    mint: Keypair;
  }) {
    const slippageBasisPoints = 500n;

    const pumpfun = new PumpFunSDK(
      new AnchorProvider(
        new Connection(this.config.get<string>('SOLANA_RPC_URL')!),
        new Wallet(Keypair.generate()),
      ),
    );

    if (metadataUri) {
      this.logger.log(`token metadata uri is provided: ${metadataUri}`);
    } else {
      this.logger.log('create token metadata');
      const tokenMetadata = await pumpfun.createTokenMetadata({
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        file: token.file,
        twitter: token.twitter,
        telegram: token.telegram,
        website: token.website,
      });
      metadataUri = tokenMetadata.metadataUri;
      this.logger.log(
        'create token metadata success: ' + JSON.stringify(tokenMetadata),
      );
    }

    const instructions: TransactionInstruction[] = [];

    const createTx = await pumpfun.getCreateInstructions(
      new PublicKey(creator),
      token.name,
      token.symbol,
      metadataUri,
      mint,
    );
    instructions.push(...createTx.instructions);

    if (buyAmountSol > 0) {
      const globalAccount = await pumpfun.getGlobalAccount();
      const buyAmount = globalAccount.getInitialBuyPrice(
        BigInt(buyAmountSol * LAMPORTS_PER_SOL),
      );
      const buyAmountWithSlippage = calculateWithSlippageBuy(
        buyAmount,
        slippageBasisPoints,
      );

      const buyTx = await pumpfun.getBuyInstructions(
        new PublicKey(creator),
        mint.publicKey,
        new PublicKey(globalAccount.feeRecipient),
        buyAmount,
        buyAmountWithSlippage,
      );
      instructions.push(...buyTx.instructions);
    }

    return { instructions, metadataUri };
  }

  async checkIfNftIndexed(nftId: string) {
    const nft = await this.mongo.nfts.findOne({ nftId });
    return nft !== null;
  }

  async checkIfCoinCreated(coin: NftPrimaryCoin) {
    const mintAccount = await this.connection.getAccountInfo(
      new PublicKey(coin.mintAddress),
    );
    return mintAccount !== null;
  }

  async setMetadataUri(coin: NftPrimaryCoin, metadataUri: string) {
    await this.mongo.nftPrimaryCoins.updateOne(
      { _id: coin._id },
      { $set: { metadataUri } },
    );
  }

  async markCoinAsCreated(coin: NftPrimaryCoin) {
    await this.mongo.nftPrimaryCoins.updateOne(
      { _id: coin._id },
      { $set: { created: true } },
    );
  }
}
