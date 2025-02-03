import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateAgentDto } from './agent.types.js';
import { ElizaManagerService } from './eliza-manager.service.js';
import {
  calculateWithSlippageBuy,
  PriorityFee,
  PumpFunSDK,
  sendTx,
} from 'pumpdotfun-sdk';
import { Commitment, Connection, Keypair, Transaction } from '@solana/web3.js';
import { DeriveKeyProvider } from '@elizaos/plugin-tee';
import { stringToUuid } from '@elizaos/core';
import { ConfigService } from '@nestjs/config';
import { Wallet, AnchorProvider } from '@coral-xyz/anchor';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import bs58 from 'bs58';
import { CacheTTL } from '@nestjs/cache-manager';
import { ElevenlabsService } from '../shared/elevenlabs.service.js';

@Controller('/agent')
export class AgentController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly elevenlabs: ElevenlabsService,
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
  ) {}

  @Post('/')
  async startNFTAgent(@Body() body: CreateAgentDto) {
    await this.elizaManager.startAgentLocal(body);
  }

  @Get('/account')
  async getNftAccount(
    @Query('chain') chain: string,
    @Query('nftId') nftId: string,
    @Query('agentId') agentId: string,
  ) {
    const account = await this.elizaManager.getAgentAccount(
      chain,
      nftId,
      agentId,
    );
    return {
      account,
    };
  }

  @Get('/voices')
  @CacheTTL(3600)
  async getVoices() {
    return await this.elevenlabs.getVoices();
  }

  @Post('/pump')
  async pumpToken(
    @Body()
    req: {
      nftId: string;
      metadataUrl: string;
      name: string;
      symbol: string;
      description?: string;
      buyAmountSol: number;
    },
  ) {
    const account = await this.elizaManager.getAgentAccount(
      'solana',
      req.nftId,
    );
    const provider: DeriveKeyProvider = new DeriveKeyProvider(
      this.appConfig.get<string>('TEE_MODE'),
    );
    const secrectSalt = ElizaManagerService.getAgentSecretSalt(
      'solana',
      req.nftId,
    );
    const agentId = stringToUuid(req.nftId);
    const solanaResult = await provider.deriveEd25519Keypair(
      secrectSalt,
      'solana',
      agentId,
    );
    this.logger.log(
      'pump: solana key',
      solanaResult.keypair.publicKey.toBase58(),
      this.appConfig.get<string>('SOLANA_RPC_URL'),
    );
    const connection = new Connection(
      this.appConfig.get<string>('SOLANA_RPC_URL'),
    );
    const sdk = new PumpFunSDK(
      new AnchorProvider(connection, new Wallet(solanaResult.keypair), {
        commitment: 'confirmed',
      }),
    );
    const lamports = Math.floor(Number(req.buyAmountSol) * 1_000_000_000);
    await createAndBuy(
      sdk,
      solanaResult.keypair,
      Keypair.generate(),
      BigInt(lamports),
      req.name,
      req.symbol,
      req.metadataUrl,
    );
  }
}

async function createAndBuy(
  sdk: PumpFunSDK,
  creator: Keypair,
  mint: Keypair,
  buyAmountSol: bigint,
  name: string,
  symbol: string,
  url: string,
) {
  // creator = Keypair.fromSecretKey(bs58.decode('5GxYoQoBwFvWogRvXMPZPZUx9bScUH6fUKzuSjGLGuj4hePaqSm5tMU1CagmMVjtSN33TCH6Bcu5pBiifLqimUGp'));
  console.log(
    'pump:',
    creator.publicKey.toBase58(),
    bs58.encode(creator.secretKey),
    mint.publicKey.toBase58(),
    buyAmountSol,
    name,
    symbol,
    url,
  );
  let createTx = await sdk.getCreateInstructions(
    creator.publicKey,
    name,
    symbol,
    url,
    mint,
  );
  let newTx = new Transaction().add(createTx);
  if (buyAmountSol > 0) {
    const globalAccount = await sdk.getGlobalAccount('confirmed');
    const buyAmount = globalAccount.getInitialBuyPrice(buyAmountSol);
    const buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmountSol,
      BigInt(100),
    );
    const buyTx = await sdk.getBuyInstructions(
      creator.publicKey,
      mint.publicKey,
      globalAccount.feeRecipient,
      buyAmount,
      buyAmountWithSlippage,
    );
    newTx.add(buyTx);
  }
  let createResults = await sendTx(
    sdk.connection,
    newTx,
    creator.publicKey,
    [creator, mint],
    undefined,
    'confirmed',
  );
  console.log('pump:createResults', createResults);
  return createResults;
}
