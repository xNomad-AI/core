import { DirectClient } from '@elizaos/client-direct';
import {
  Character,
  Memory,
  ModelProviderName,
  stringToUuid,
} from '@elizaos/core';
import {
  AutoSwapTask,
  AutoSwapTaskTable,
  executeAutoTokenSwapTask,
} from '@elizaos/plugin-solana';
import { TEEMode } from '@elizaos/plugin-tee';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Timeout } from '@nestjs/schedule';
import { newTradeAgentRuntime, startAgent } from '../eliza/starter/index.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { CharacterConfig } from '../shared/mongo/types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { sleep } from '../shared/utils.service.js';
import { WalletProxyService } from '../wallet/wallet-proxy.service.js';

export type ElizaAgentConfig = {
  chain: string;
  nftId: string;
  character: Character;
  characterConfig: CharacterConfig;
};

@Injectable()
export class ElizaManagerService {
  private elizaClient: DirectClient;

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly mongoService: MongoService,
    private readonly walletProxyService: WalletProxyService,
  ) {
    logger.setContext(ElizaManagerService.name);
    this.elizaClient = new DirectClient();
    this.elizaClient.startAgent = async (
      character: Character,
      nftId?: string,
    ) => {
      return startAgent(character, this.elizaClient, nftId, {
        mongoClient: this.mongoService.client,
      });
    };
  }

  async startAgentServer() {
    try {
      this.elizaClient.start(this.appConfig.get<number>('AGENT_SERVER_PORT'));
    } catch (e) {
      this.logger.error(`Failed to start agent server: ${e.message}`);
      await sleep(10000);
      this.startAgentServer();
    }
  }

  async isAgentRunning(agentId: string) {
    return !!this.elizaClient.agents.get(agentId);
  }

  async startAgentLocal(config: ElizaAgentConfig) {
    try {
      const character = await this.initAgentCharacter(config);
      await startAgent(character, this.elizaClient, config.nftId, {
        mongoClient: this.mongoService.client,
      });
    } catch (e) {
      this.logger.error(
        `Failed to start agent for NFT ${config.nftId}: ${e.message}`,
      );
    }
  }

  async stopAgent(agentId: string) {
      // stop all running clients of agent
    try {
      const runtime = this.elizaClient.agents.get(agentId);
      await runtime.stop();
    }catch (e){
      this.logger.error(e)
    }
  }

  async getAgentStatus(agentId) {
    const runtime = this.elizaClient.agents.get(agentId);
    if (!runtime) {
      return {
        status: 'stopped',
      };
    } else {
      return {
        status: 'running',
      };
    }
  }

  async checkTee() {
    const agents: Map<string, any> = this.elizaClient.agents;
    agents.forEach((runtime, agentId) => {
      const salt = runtime.getSetting('WALLET_SECRET_SALT');
      const teeMode = runtime.getSetting('TEE_MODE');
      if (!salt || !teeMode) {
        this.logger.error(`Agent ${agentId} is missing salt or teeMode`);
      }
    });
  }

  async deleteAgentMemory(
    agentId: string,
    opts?: {
      roomId?: string;
      userId?: string;
      memoryId?: string;
    },
  ) {
    const filter: any = { agentId };
    if (opts.roomId) {
      filter.roomId = stringToUuid(opts.roomId);
    }
    if (opts.userId) {
      filter.roomId = stringToUuid(opts.userId);
    }
    if (opts?.memoryId){
      filter.id = opts.memoryId;
    }
    await this.mongoService.client
      .db('agent')
      .collection('memories')
      .deleteMany(filter);
  }

  getElizaEnvs(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(([_, v]) => v !== undefined),
    ) as Record<string, string>;
  }

  getAgentSecretSalt(chain: string, nftId: string) {
    const prefix = this.appConfig.get<string>('AGENT_SECRET_SALT_PREFIX');
    if (!prefix) {
      throw new Error('AGENT_SECRET_SALT_PREFIX is not set');
    }
    return `${prefix}-${chain}:${nftId}`;
  }

  async getAgentAccount(
    chain: string,
    nftId: string,
    agentId?: string,
  ): Promise<{ solana: string; evm: string }> {
    const secrectSalt = this.getAgentSecretSalt(chain, nftId);
    agentId ??= stringToUuid(nftId);

    const { publicKey, evmAddress } =
      await this.walletProxyService.getWalletKey(
        secrectSalt,
        agentId,
        this.appConfig.get<string>('TEE_MODE') as TEEMode,
        false,
      );

    return {
      solana: publicKey.toBase58(),
      evm: evmAddress,
    };
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

  async runAutoSwapTask() {
    const memories = await this.mongoService.client
      .db('agent')
      .collection('memories')
      .find<Memory>({ type: AutoSwapTaskTable })
      .toArray();
    this.logger.log(`Running auto swap task for ${memories.length} tasks`);
    for (const memory of memories) {
      const { agentId } = memory as Memory;
      const { nftId, chain, aiAgent } = await this.mongoService.nfts.findOne({
        agentId,
      });
      if (!nftId) {
        continue;
      }
      const nftConfig = await this.mongoService.nftConfigs.findOne({
        nftId: nftId,
      });
      const character = await this.initAgentCharacter({
        nftId,
        chain,
        characterConfig: nftConfig?.characterConfig,
        character: aiAgent.character,
      });
      try {
        const runtime = await newTradeAgentRuntime(
          character,
          this.mongoService.client,
        );
        await executeAutoTokenSwapTask(runtime, memory);
      } catch (error) {
        this.logger.error(`Error during token swap:, ${error}`);
      }
    }
  }

  async initAgentCharacter(config: ElizaAgentConfig) {
    const { chain, nftId, characterConfig } = config;
    let { character } = config;
    character = {
      ...character,
      ...characterConfig,
      modelProvider: this.appConfig.get<ModelProviderName>(
        'AGENT_MODEL_PROVIDER',
      ),
    };
    const envVars = this.getElizaEnvs();
    const salt = this.getAgentSecretSalt(chain, nftId);
    const teeMode = this.appConfig.get<string>('TEE_MODE');
    if (!character.settings) {
      character.settings = {};
    }
    character.settings.secrets = {
      ...envVars,
      ...character.settings?.secrets,
    };
    character.settings.secrets['TEE_MODE'] = teeMode;
    character.settings.secrets['WALLET_SECRET_SALT'] = salt;
    character.settings['TEE_MODE'] = teeMode;
    character.settings['WALLET_SECRET_SALT'] = salt;
    if (character.modelProvider === "deepseek" && !character.settings['modelConfig']) {
      character.settings['modelConfig'] = {
        temperature: 0.4,
        max_response_length: 4096,
        maxInputTokens: 64000
      }
    }
    const {solana, evm} = await this.getAgentAccount(chain, nftId);
    character.knowledge ||= [];
    character.knowledge.push('I am an AI Agent running in TEE, I am generated by xNomad AI-NFT');
    character.knowledge.push('I support Solana token trading now, I will support evm soon, and other blockchains in the future');
    character.knowledge.push(`** I have multi wallet address, on solana it is ${solana}, and on evm is ${evm} **`)

    return character;
  }


  async getAgentAutotasks(agentId: string) {
    const memories = await this.mongoService.client
      .db('agent')
      .collection('memories')
      .find<Memory>({
        type: AutoSwapTaskTable,
        agentId,
      }).sort({_id:-1})
      .toArray();
    return memories.map((memory) => {
      let task: AutoSwapTask;
      if (typeof memory.content === 'string') {
        task = JSON.parse(memory.content)?.task as AutoSwapTask;
      } else {
        task = memory.content?.task as AutoSwapTask;
      }
      return {
        id: memory.id,
        userId: memory.userId,
        ...task,
      };
    });
  }

  async isAgentOwner(agentId: string, ownerAddress : string){
    const nft = await this.mongoService.nfts.findOne({agentId});
    const owner = await this.mongoService.nftOwners.findOne({
      chain: nft?.chain,
      contractAddress: nft?.contractAddress,
      tokenId: nft?.tokenId,
    });
    return owner?.ownerAddress === ownerAddress;
  }
}
