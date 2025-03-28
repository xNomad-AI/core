import { BadRequestException, Injectable } from "@nestjs/common";
import { MongoService } from "../shared/mongo/mongo.service.js";
import { CopyTrade, getChainDefaultTradeSettings, LimitOrder, TradeSettingsEvm, TradeSettingsSolana } from "../shared/mongo/types.js";
import { TradeMonitorService } from "../shared/trade-monitor.service.js";
import { TransientLoggerService } from "../shared/transient-logger.service.js";
import { Timeout } from "@nestjs/schedule";
import { sleep } from "../shared/utils.service.js";
import { ElizaManagerService } from "./eliza-manager.service.js";
import { ConfigService } from "@nestjs/config";
import { SolanaClient, SwapTokenService as SolanaSwapService } from "@elizaos/plugin-solana";
import { EVMClient, SwapTokenService as EVMSwapService } from "@elizaos/plugin-evm";
import { BigNumber } from "bignumber.js";
import { BirdeyeService } from "../shared/birdeye.service.js";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
@Injectable()
export class AgentTradeService {
  constructor(
    private readonly tradeMonitor: TradeMonitorService,
    private readonly config: ConfigService,
    private readonly mongo: MongoService,
    private readonly logger: TransientLoggerService,
    private readonly elizaManager: ElizaManagerService,
    private readonly birdeye: BirdeyeService,
) {}
  
  async getAgentAutotasks(agentId: string) {
    const limitOrders = await this.mongo.limitOrders.find<LimitOrder>({agentId}).toArray();
    return limitOrders;
  }

  async getCopyTrades(agentId: string) {
    return await this.mongo.copyTrades.find({agentId}).toArray();
  }

  async runAutoSwapTask() {
    const limitOrders = await this.mongo.limitOrders.find<LimitOrder>({}).toArray();
    this.logger.log(`Running auto swap task for ${limitOrders.length} tasks`);
    for (const limitOrder of limitOrders) {
      try {
        if (limitOrder.chain === 'solana') {
          await this.executeSolanaLimitOrder(limitOrder);
        }else{
          await this.executeEvmLimitOrder(limitOrder);
        }
      } catch (error) {
        this.logger.error(`Error during token swap:, ${error}`);
      }
    }
  }

  @Timeout(5000)
  async startAutoSwapTask() {
    while (true) {
      try {
        await this.runAutoSwapTask();
      } catch (error) {
        this.logger.error(`Error during auto swap task:, ${error}`);
      }
      await sleep(10000);
    }
  }

  async cancelCopyTrade(agentId: string, id: number) {
    await this.tradeMonitor.cancelCopyTrade(id);
    await this.mongo.copyTrades.deleteOne({ agentId, id });
  }

  async updateCopyTradeStatus(agentId: string, id: number, status: string) {
    await this.mongo.copyTrades.updateOne({ agentId, id }, { $set: { status } });
  }

  async updateCopyTrade(agentId: string, id: number, {name, copySell, mode, status, fixedAmount, percentage}: CopyTrade){
    const filter: any = { agentId }
    if (id){
      filter.id = id
    }
    const copyTrade = await this.mongo.copyTrades.findOne(filter);
    if (!copyTrade?.id){
      throw new BadRequestException('Copy trade not exists');
    }
    await this.mongo.copyTrades.updateOne(filter, {
      $set: {
        copySell,
        name,
        mode,
        status,
        fixedAmount,
        percentage,
      },
      $setOnInsert: { agentId, id },
    }, { upsert: true }  );
  }

async executeEvmLimitOrder(
    {
      id,
      agentId,
      expireAt,
      startAt,
      priceCondition,
      targetPrice,
      targetToken,
      targetTokenCA,
      inputTokenCA,
      inputTokenSymbol,
      outputTokenSymbol,
      inputTokenAmount,
      inputTokenPercentage,
      outputTokenCA,
    }: LimitOrder,
  ) {
    this.logger.log(`executeAutoTokenSwapTask ${id}`);
    const {chain, nftId} = await this.mongo.nfts.findOne({agentId});
  
    if (expireAt && new Date(expireAt).getTime() <= Date.now()) {
      this.logger.log(`Task has expired ${id}`);
      await this.mongo.limitOrders.deleteOne({id});
    }
  
    if (startAt && new Date(startAt).getTime() > Date.now()) {
      this.logger.log(`Task is not ready to start yet ${id}`);
      return;
    }
  
    if (
      targetPrice && 
      priceCondition
    ) {
      const tokenPrice = await this.birdeye.getTokenPrice(chain, targetTokenCA);
      const tokenPriceMatched =
        priceCondition === 'below'
          ? tokenPrice && tokenPrice < Number(targetPrice)
          : tokenPrice && tokenPrice > Number(targetPrice);
      if (!tokenPriceMatched) {
        this.logger.log(
          `Token price not matched ${id}, price: ${tokenPrice}, expected: ${targetPrice}`,
        );
        return;
      }
    }
    this.logger.log(
      `AUTO_TASK started successfully, ${id}, task: ${JSON.stringify({
        id,
        priceCondition,
        targetPrice,
        targetToken,
        inputTokenSymbol,
        outputTokenSymbol,
        inputTokenAmount,
      })}`,
    );
  
    const {evmAddress: address, evmPrivateKey: privateKey} = await this.elizaManager.getAgentAccountKeypair(chain, nftId, agentId);
    this.logger.log(
        `swapToken ${address} : ${inputTokenCA} for ${outputTokenCA} amount: ${inputTokenAmount}`,
      );
    const rpcUrl = this.config.get<string>(`${chain.toUpperCase()}_RPC_URL`);
    const evmClient = new EVMClient({rpcUrl, chainName: chain});
    const decimals = await evmClient.getTokenDecimals(inputTokenCA);
    const {slippage, mode, tip, gasMode, maxFeePerGas } = await this.getTradeSettingsByChain(agentId, chain) as TradeSettingsEvm;
    const txid = await new EVMSwapService().swapToken(
    {
        rpcUrl,
        chainName: chain,
        userWalletAddress: address,
        privateKey,
        inputTokenCA,
        outputTokenCA,
        amount: BigNumber(inputTokenAmount).multipliedBy(new BigNumber(10).pow(decimals)).toFixed(0),
        slippage,
        mode,
        tip: BigNumber(tip).toString(),
        gasMode,
        maxFeePerGas: BigNumber(maxFeePerGas).toFixed(0),
    });
    await this.mongo.limitOrders.deleteOne({id});
    this.logger.log(`AUTO_TASK Finished successfully ${id}, txId: ${txid}`);
  }

  async executeSolanaLimitOrder(limitOrder: LimitOrder) {
    const {
        id,
        chain,
        agentId,
        expireAt,
        startAt,
        priceCondition,
        targetPrice,
        targetToken,
        targetTokenCA,
        inputTokenCA,
        inputTokenSymbol,
        outputTokenSymbol,
        inputTokenAmount,
        inputTokenPercentage,
        outputTokenCA,
      } = limitOrder;
    this.logger.log(`AUTO_TASK checking, id: ${id}`);
    const { nftId } = await this.mongo.nfts.findOne({agentId});
    if (expireAt && new Date(expireAt).getTime() <= Date.now()) {
      this.logger.log(`Task has expired ${id}`);
      await this.mongo.limitOrders.deleteOne({id});
    }
  
    if (startAt && new Date(startAt).getTime() > Date.now()) {
      this.logger.log(`Task is not ready to start yet ${id}`);
      return;
    }
  
    if (targetPrice && priceCondition) {
      const tokenPrice = await this.birdeye.getTokenPrice(chain, targetTokenCA);
      const tokenPriceMatched =
        priceCondition === 'below'
          ? tokenPrice && tokenPrice < Number(targetPrice)
          : tokenPrice && tokenPrice > Number(targetPrice);
      if (!tokenPriceMatched) {
        this.logger.log(
          `Token price not matched ${id}, price: ${tokenPrice}, expected: ${targetPrice}`,
        );
        return;
      }
    }
    this.logger.log(
      `AUTO_TASK started successfully, ${id}, task: ${JSON.stringify(limitOrder)}`,
    );
  
    await this.mongo.limitOrders.deleteOne({id});
    const { solanaKeypair: keypair } = await this.elizaManager.getAgentAccountKeypair(chain, nftId, agentId);
    const rpcUrl = this.config.get<string>('SOLANA_RPC_URL');
    const connection = new Connection(rpcUrl);
    const decimals = await new SolanaClient(rpcUrl, keypair.publicKey).getMintDecimals(inputTokenCA);
    const {slippage, priorityFee, tip, mode } = await this.getTradeSettingsByChain(agentId, chain) as TradeSettingsSolana;
    const txid = await new SolanaSwapService().swapToken(
      {
        connection,
        userWalletAddress: keypair.publicKey.toBase58(),
        inputTokenCA,
        outputTokenCA,
        amount: BigNumber(inputTokenAmount).multipliedBy(new BigNumber(10).pow(decimals)).integerValue(),
        keyPair :keypair,
        slippage,
        priorityFee,
        tip: tip * LAMPORTS_PER_SOL,
        mode,
      });
    await this.mongo.limitOrders.deleteOne({id});
    this.logger.log(`AUTO_TASK Finished successfully id: ${id}, txId: ${txid}`);
    return txid;     
  }


  async getTradeSettingsByChain(agentId: string, chain: string = 'solana'){
    const tradeSettings = await this.getAgentTradeSettings(agentId);
    return tradeSettings[chain] || getChainDefaultTradeSettings(chain);
  }

  async getAgentTradeSettings(agentId: string){
    const {nftId} = await this.mongo.nfts.findOne({agentId});
    const nftConfig = await this.mongo.nftConfigs.findOne({nftId});
    return {
      solana: getChainDefaultTradeSettings('solana'),
      bsc: getChainDefaultTradeSettings('bsc'),
      ...nftConfig?.tradeSettings
    };
  }
}
