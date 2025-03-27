import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { ElizaManagerService } from '../../agent/eliza-manager.service.js';
import { FourMemeApi } from '../../shared/fourmeme.js';
import { MongoService } from '../../shared/mongo/mongo.service.js';
import { NftPrimaryCoin } from '../../shared/mongo/types.js';
import { TradeMonitorService } from '../../shared/trade-monitor.service.js';
import { TransientLoggerService } from '../../shared/transient-logger.service.js';
import { LaunchpadService } from '../launchpad.service.js';


@Injectable()
export class EvmLaunchCoinService {
  private isProcessing = false;
  private provider: ethers.Provider;

  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly elizaManager: ElizaManagerService,
    private readonly logger: TransientLoggerService,
    private readonly launchpadService: LaunchpadService,
    private readonly tradeMonitorService: TradeMonitorService,
    private readonly httpService: HttpService,
  ) {
    this.logger.setContext(EvmLaunchCoinService.name);
    this.provider = new ethers.JsonRpcProvider(
      this.config.get<string>('BSC_RPC_URL')!,
    );
  }

  @Interval(2 * 1000)
  async launchCoins() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      const coins = await this.mongo.nftPrimaryCoins
        .find({
          chain: 'bsc',
          created: false,
          // we assume that if coin is not created in the last 5 min, the NFT is not created
          createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) },
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

    const agentWallet = await this.elizaManager
      .getAgentAccountKeypair(coin.chain, coin.nftId)
      .then(({ evmPrivateKey }) => new ethers.Wallet(evmPrivateKey));

    await this.checkAgentWalletBalance(agentWallet, coin.initialBuyAmountSol);

    const fourMemeApi = new FourMemeApi();
    const userToken = await fourMemeApi.login(agentWallet);
    const quote = await fourMemeApi.getCreateTokenQuote(userToken, {
      name: coin.coinInfo.name,
      symbol: coin.coinInfo.symbol,
      description: coin.coinInfo.description,
      image: coin.coinInfo.image,
      initialBuyAmount: coin.initialBuyAmountSol || 0,
      twitter: coin.coinInfo.twitter || undefined,
      telegram: coin.coinInfo.telegram || undefined,
      website: coin.coinInfo.website || undefined,
    });
    const { tokenAddress, txid } = await fourMemeApi.createAndBuyToken(agentWallet, quote, coin.initialBuyAmountSol || 0);
    this.logger.log(
      `Coin ${coin.nftId} created, txid: ${txid}, token address: ${tokenAddress}`,
    );
    await this.markCoinAsCreated(coin, tokenAddress);

    // register token in indexer to track token data
    await this.tradeMonitorService.registerAgentCreatedToken({
      chain: coin.chain,
      address: tokenAddress,
      creatorAddress: agentWallet.address,
      nftId: coin.nftId,
      bound: true,
    });

    return txid;
  }

  async checkIfNftIndexed(nftId: string) {
    const [, contractAddress, tokenId] = nftId.split(':');
    const contract = new ethers.Contract(
      contractAddress,
      ['function ownerOf(uint256 tokenId) external view returns (address)'],
      this.provider,
    );
    return contract
      .ownerOf(tokenId)
      .then(() => true)
      .catch((e) => {
        if (e.message.includes('execution reverted')) {
          return false;
        }
        throw e;
      });
  }

  async markCoinAsCreated(coin: NftPrimaryCoin, mintAddress: string) {
    await this.mongo.nftPrimaryCoins.updateOne(
      { _id: coin._id },
      { $set: { created: true, mintAddress } },
    );
  }

  private async checkAgentWalletBalance(
    wallet: ethers.Wallet,
    initialBuyAmount: number,
  ) {
    const balance = await this.provider.getBalance(wallet.address);
    this.logger.log(
      `Agent account balance: ${ethers.formatEther(balance)} BNB`,
    );
    const neededBalance = ethers.parseEther(
      (initialBuyAmount * 1.01 + 0.002).toString(),
    );
    if (balance < neededBalance) {
      throw new Error(
        `Agent does not have enough balance, balance: ${ethers.formatEther(balance)}, needed: ${ethers.formatEther(neededBalance)}`,
      );
    }
  }
}
