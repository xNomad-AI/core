import { Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { Body, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { SwapTokenService } from '../utils/swap-token.service.js';
import { SwapTokenDto } from '../utils/type.js';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getWalletKeyFromWalletService,
  SolanaClient,
} from '@elizaos/plugin-solana';
import { TEEMode } from '@elizaos/plugin-tee';
import { BigNumber } from 'bignumber.js';
import { DEFAULT_TRADE_SETTINGS } from '../shared/mongo/types.js';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';

class BaseCallbackDto {
  monitorId: number;
  clientId: string;
  timestamp: number;
  txHash: string;
}

class PriceCallbackDto extends BaseCallbackDto {
  tokenAddress: string;
  triggeredPrice: number;
  targetPrice: number;
  conditionType: string;
}

class AddressCallbackDto extends BaseCallbackDto {
  address: string;
  transfers: OKXTransfer[];
}

function getSwapInfo(callback: AddressCallbackDto) {
  if (callback.transfers.length !== 2) {
    throw new Error('Invalid swap transfer length');
  }
  const inputTransfer =
    callback.transfers[0].from === callback.address
      ? callback.transfers[0]
      : callback.transfers[1];
  const outputTransfer =
    callback.transfers[0].from === callback.address
      ? callback.transfers[1]
      : callback.transfers[0];
  return {
    inputTokenCA: inputTransfer.tokenAddress,
    inputTokenAmount: inputTransfer.amount,
    outputTokenCA: outputTransfer.tokenAddress,
    outputTokenAmount: outputTransfer.amount,
  };
}

export interface OKXTransfer {
  from: string;
  to: string;
  tokenAddress: string;
  symbol: string;
  amount: string;
}

@Controller('/callbacks')
export class CallbackController {
  private apikey: string;

  constructor(
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
    private elizaManager: ElizaManagerService,
    private mongo: MongoService,
  ) {
    this.apikey = this.appConfig.get<string>('TRADE_MONITOR_SERVICE_API_KEY')!;
  }

  @Post('/limit-order')
  async handlePriceCallback(
    @Body() callbackData: PriceCallbackDto,
    @Headers('X-Monitor-ID') monitorId: string,
    @Headers('X-Agent-Address') agentAddress: string,
    @Headers('api-key') apiKey: string,
  ) {
    this.validateApiKey(apiKey);

    try {
      this.logger.debug('Received price monitor callback', {
        monitorId: callbackData.monitorId,
        tokenAddress: callbackData.tokenAddress,
        triggeredPrice: callbackData.triggeredPrice,
      });

      // todo @everimbaq: validate task and swap token

      return {
        success: true,
        message: 'Price monitor callback processed successfully',
      };
    } catch (error) {
      this.logger.error('Error processing price monitor callback', {
        error: error.message,
        monitorId: callbackData.monitorId,
      });
      throw error;
    }
  }

  @Post('/copy-trade')
  @HttpCode(200)
  async handleAddressCallback(
    @Body() callbackData: AddressCallbackDto,
    @Headers('X-Monitor-ID') id: string,
    @Headers('api-key') apiKey: string,
  ) {
    // this.validateApiKey(apiKey);
    this.logger.log('Received address monitor callback', {
      ...callbackData,
      id,
    });

    const solAddress = this.appConfig.get<string>('SOL_ADDRESS');

    const { inputTokenCA, inputTokenAmount, outputTokenCA } =
      getSwapInfo(callbackData);
    if (inputTokenCA != solAddress && outputTokenCA != solAddress) {
      this.logger.log(`ignore not SOL swap, ${id}`);
      return;
    }

    const copyTradeTask = await this.mongo.copyTrades.findOne({id: Number(id)});
    if (!copyTradeTask) {
      throw new Error('Copy trade not found');
    }

    if (copyTradeTask.status !== 'running') {
      this.logger.log(`Copy trade is not running ${id}`);
      return;
    }

    const agentId = copyTradeTask.agentId;
    const nft = await this.mongo.nfts.findOne({ agentId });
    const nftConfig = await this.mongo.nftConfigs.findOne({ nftId: nft.nftId });
    const { slippage, mode, priorityFee, tip } =
      nftConfig?.trade || DEFAULT_TRADE_SETTINGS;
    const connection = await new Connection(
      this.appConfig.get('SOLANA_RPC_URL'),
      'confirmed',
    );
    const keypairResult = await getWalletKeyFromWalletService({
      teeMode: this.appConfig.get<string>('TEE_MODE') as TEEMode,
      walletSecretSalt: this.elizaManager.getAgentSecretSalt('solana', nft.nftId),
      agentId,
      requirePrivateKey: true,
      endpoint: this.appConfig.get<string>('WALLET_SERVICE_ENDPOINT'),
      walletServiceSecretToken: this.appConfig.get<string>(
        'WALLET_SERVICE_SECRET_TOKEN',
      ),
    });
    const solanaClient = new SolanaClient(
      this.appConfig.get<string>('SOLANA_RPC_URL'),
      keypairResult.keypair.publicKey,
    );
    const swapTokenDto: SwapTokenDto = {
      amount: '0',
      connection,
      inputTokenCA,
      keyPair: keypairResult.keypair,
      mode,
      outputTokenCA,
      priorityFee: priorityFee,
      slippage,
      tip: tip * LAMPORTS_PER_SOL,
      userWalletAddress: copyTradeTask.walletAddress,
    };

    // copy buy
    if (inputTokenCA === solAddress) {
      const decimals = await solanaClient.getMintDecimals(inputTokenCA);
      if (copyTradeTask.mode == 'fixedAmount') {
        swapTokenDto.amount = BigNumber(copyTradeTask.fixedAmount)
          .multipliedBy(10 ** decimals)
          .integerValue();
      } else {
        swapTokenDto.amount = BigNumber(copyTradeTask.percentage)
          .multipliedBy(inputTokenAmount)
          .multipliedBy(10 ** decimals)
          .integerValue();
      }
    }
    // copy sell
    if (outputTokenCA === solAddress) {
      if (!copyTradeTask.copySell) {
        this.logger.log(`ignore copy sell, ${id}`);
        return;
      }
      swapTokenDto.amount = await solanaClient.getRawBalance(inputTokenCA);
    }

    if (Number(swapTokenDto.amount) == 0){
      this.logger.log(`ignore zero amount, ${id}`);
      return;
    }

    this.logger.log(`copy trade request: ${JSON.stringify({
      ...swapTokenDto,
      connection: undefined,
      keyPair: undefined,
    })}`);
    const txId = await new SwapTokenService().swapToken(swapTokenDto);
    return {
      success: true,
      message: `copy trade callback processed successfully, ${txId}`,
    };
  }

  private validateApiKey(apiKey: string) {
    if (apiKey !== this.apikey) {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
