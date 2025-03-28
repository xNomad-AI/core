import { Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { Body, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  getWalletKeyFromWalletService as getSolanaWallet,
  SwapTokenService as SolanaSwapTokenService,
  SolanaClient,
} from '@elizaos/plugin-solana';
import { 
  getAccountFromWalletService as getEvmWallet, 
  SwapTokenService as EvmSwapTokenService,
  nativeTokenAddress,
  EVMClient,
} from '@elizaos/plugin-evm';
import { BigNumber } from 'bignumber.js';
import { CopyTrade, DEFAULT_TRADE_SETTINGS } from '../shared/mongo/types.js';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';
import { NATIVE_MINT } from '@solana/spl-token';

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

class TxToCopy {
  inputTokenCA: string;
  txSigner: string;
  txHash: string;
  inputTokenAmount: string;
  outputTokenCA: string;
  outputTokenAmount: string;
}

function getSwapInfo(callback: AddressCallbackDto) : TxToCopy {
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
    txSigner: callback.address,
    txHash: callback.txHash,
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
    this.validateApiKey(apiKey);
    this.logger.log('Received address monitor callback', {
      ...callbackData,
      id,
    });
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
    const wallet = await this.elizaManager.getAgentAccountKeypair(nft.chain, nft.nftId, agentId);
    const tradeConfig = nftConfig?.trade || DEFAULT_TRADE_SETTINGS;
    const swapInfo = getSwapInfo(callbackData);
    if (copyTradeTask.chain === 'solana') {
      return await this.copyTradeSolana(wallet, copyTradeTask, swapInfo, tradeConfig);
    } else {
      return await this.copyTradeEvm(wallet, copyTradeTask, swapInfo, tradeConfig);
    }
  }
  

  private validateApiKey(apiKey: string) {
    if (apiKey !== this.apikey) {
      throw new UnauthorizedException('Invalid API key');
    }
  }

  async copyTradeEvm(wallet: {evmAddress: string, evmPrivateKey: string}, copyTradeTask: CopyTrade, {inputTokenCA, outputTokenCA, inputTokenAmount, txSigner, txHash}: TxToCopy, {mode, priorityFee, tip, slippage}: any = DEFAULT_TRADE_SETTINGS) {
    if (inputTokenCA !== nativeTokenAddress && outputTokenCA !== nativeTokenAddress) {
      this.logger.log(`ignore not native token swap, id: ${copyTradeTask.id}`);
      return;
    }
    const chain = copyTradeTask.chain;
    const rpcUrl = this.appConfig.get<string>(`${chain.toUpperCase()}_RPC_URL`);
    const {evmAddress: address, evmPrivateKey: privateKey} = wallet;
    const evmClient = new EVMClient({rpcUrl, chainName: chain});
    const tokenDecimals = await evmClient.getTokenDecimals(inputTokenCA);

    const swapTokenDto: any = {
      amount: '0',
      chainName: chain,
      rpcUrl,
      inputTokenCA,
      outputTokenCA,
      mode,
      slippage,
      privateKey,
      userWalletAddress: address,
    }
    // copy buy
    if (inputTokenCA === nativeTokenAddress) {
      if (copyTradeTask.mode == 'fixedAmount') {
        swapTokenDto.amount = BigNumber(copyTradeTask.fixedAmount).multipliedBy(10 ** tokenDecimals).toString();
      } else {
        const userBalance = await evmClient.getTokenUIBalance(inputTokenCA, address);
        swapTokenDto.amount = BigNumber(userBalance).multipliedBy(copyTradeTask.percentage).multipliedBy(10 ** tokenDecimals).toString();
      }
    }
    // copy sell
    if (outputTokenCA === nativeTokenAddress) {
      if (!copyTradeTask.copySell) {
        this.logger.log(`ignore copy sell, id: ${copyTradeTask.id}`);
        return;
      }
      // calculate: inputAmount = userBalance * balanceChange / (txSignerBalance + balanceChange)
      const txSignerBalance = await evmClient.getTokenUIBalance(inputTokenCA, txSigner);
      const balanceChange = inputTokenAmount;
      const percentage = Number(balanceChange) / (Number(balanceChange) + Number(txSignerBalance));
      const userBalance = await evmClient.getTokenUIBalance(inputTokenCA, address);
      swapTokenDto.amount = BigNumber(userBalance).multipliedBy(percentage).multipliedBy(10 ** tokenDecimals).toString();
    }

    if (Number(swapTokenDto.amount) == 0){
      this.logger.log(`ignore zero amount, ${copyTradeTask.id}`);
      return;
    }

    this.logger.log(`copy trade request: ${JSON.stringify({
      ...swapTokenDto,
      privateKey: undefined,
      rpcUrl: undefined,
    })}`);
    const txId = await new EvmSwapTokenService().swapToken(swapTokenDto);
    return {
      success: true,
      txId,
      message: `copy trade processed successfully, id: ${copyTradeTask.id}, tx: ${txId}`,
    };
  }



  async copyTradeSolana({ solanaKeypair }: {solanaKeypair: Keypair}, copyTradeTask: CopyTrade, {inputTokenCA, outputTokenCA, inputTokenAmount, txSigner, txHash}: TxToCopy, {mode, priorityFee, tip, slippage}: any = DEFAULT_TRADE_SETTINGS) {
    const solAddress = NATIVE_MINT.toBase58();
    if (inputTokenCA != solAddress && outputTokenCA != solAddress) {
      this.logger.log(`ignore not SOL swap, id: ${copyTradeTask.id}`);
      return;
    }

    const connection = new Connection(
      this.appConfig.get('SOLANA_RPC_URL'),
      'confirmed',
    );

    const solanaClient = new SolanaClient(
      this.appConfig.get<string>('SOLANA_RPC_URL'),
      solanaKeypair.publicKey,
    );
    const swapTokenDto: any = {
      amount: '0',
      connection,
      inputTokenCA,
      keyPair: solanaKeypair,
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
        this.logger.log(`ignore copy sell, id: ${copyTradeTask.id}`);
        return;
      }
      // copy sell percentage of the tx
      const tokenAccount = await new SolanaClient(connection.rpcEndpoint, new PublicKey(txSigner)).getTokenAccount(inputTokenCA);
      const {preBalance, postBalance} = await SolanaSwapTokenService.getTokenBalanceChange(connection, txHash, tokenAccount);
      const sellPercentage = preBalance == '0'? 1: BigNumber(preBalance).minus(postBalance).dividedBy(preBalance);
      const balance = await solanaClient.getRawBalance(inputTokenCA);
      this.logger.log(`copy sell tx ${txHash} sell percentage: ${sellPercentage}, balance: ${balance}`);
      swapTokenDto.amount = BigNumber(balance).multipliedBy(sellPercentage).integerValue();
    }

    if (Number(swapTokenDto.amount) == 0){
      this.logger.log(`ignore zero amount, ${copyTradeTask.id}`);
      return;
    }

    this.logger.log(`copy trade request: ${JSON.stringify({
      ...swapTokenDto,
      connection: undefined,
      keyPair: undefined,
    })}`);
    const txId = await new SolanaSwapTokenService().swapToken(swapTokenDto);
    return {
      success: true,
      txId,
      message: `copy trade processed successfully, id: ${copyTradeTask.id}, tx: ${txId}`,
    };
}
}


