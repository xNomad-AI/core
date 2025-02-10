import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import {
  Character,
  Memory,
  ModelProviderName,
  stringToUuid,
} from '@elizaos/core';
import { ConfigService } from '@nestjs/config';
import { newTradeAgentRuntime, startAgent } from '../eliza/starter/index.js';
import { DirectClient } from '@elizaos/client-direct';
import { sleep } from '../shared/utils.service.js';
import { DeriveKeyProvider } from '@elizaos/plugin-tee';
import { CharacterConfig } from '../shared/mongo/types.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import {
  AutoSwapTaskTable,
  executeAutoTokenSwapTask,
} from '@elizaos/plugin-solana';
import { Timeout } from '@nestjs/schedule';

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
  ) {
    logger.setContext(ElizaManagerService.name);
    this.elizaClient = new DirectClient();
    this.elizaClient.startAgent = async (
      character: Character,
      nftId?: string,
    ) => {
      return startAgent(character, this.elizaClient, nftId, {mongoClient: this.mongoService.client});
    };
  }

  async startAgentServer() {
    try {
      this.elizaClient.start(this.appConfig.get<number>('AGENT_SERVER_PORT'));
    }catch (e) {
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
      await startAgent(character, this.elizaClient, config.nftId, {mongoClient: this.mongoService.client});
    } catch (e) {
      this.logger.error(
        `Failed to start agent for NFT ${config.nftId}: ${e.message}`,
      );
    }
  }

  async getAgentStatus(agentId){
    const runtime = this.elizaClient.agents.get(agentId);
    if (!runtime){
      return {
        status: 'stopped'
      };
    }else{
      return {
        status: 'running',
      }
    }
  }

  async checkTee(){
    const agents: Map<string, any> = this.elizaClient.agents;
    agents.forEach((runtime, agentId) => {
      const salt = runtime.getSetting('WALLET_SECRET_SALT');
      const teeMode = runtime.getSetting('TEE_MODE');
      if (!salt || !teeMode){
        this.logger.error(`Agent ${agentId} is missing salt or teeMode`);
      }
    });
  }

  async deleteAgentMemory(agentId: string, opts?: {
    roomId?: string,
    userId?: string,
  }) {
    const filter: any = { agentId };
    if (opts.roomId) {
      filter.roomId = stringToUuid(opts.roomId);
    }
    if (opts.userId) {
      filter.roomId = stringToUuid(opts.userId);
    }
    await this.mongoService.client.
      db('agent').
      collection('memories').
      deleteMany(filter);
  }

  getElizaEnvs(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;
  }

  static getAgentSecretSalt(chain: string, nftId: string) {
    return `salt-${chain}:${nftId}`;
  }

  async getAgentAccount(
    chain: string,
    nftId: string,
    agentId?: string,
  ): Promise<{ solana: string; evm: string }> {
    const provider: DeriveKeyProvider = new DeriveKeyProvider(
      this.appConfig.get<string>('TEE_MODE'),
    );
    const secrectSalt = ElizaManagerService.getAgentSecretSalt(chain, nftId);
    agentId ??= stringToUuid(nftId);
    const solanaResult = await provider.deriveEd25519Keypair(
      secrectSalt,
      'solana',
      agentId,
    );
    const evmResult = await provider.deriveEcdsaKeypair(
      secrectSalt,
      'evm',
      agentId,
    );
    return {
      solana: solanaResult.keypair.publicKey.toBase58(),
      evm: evmResult.keypair.address,
    };
  }

  @Timeout(20000)
  async startAutoSwapTask(){
    while (true){
      try {
        await this.runAutoSwapTask();
      }catch (error) {
        this.logger.error(`Error during auto swap task:, ${error}`);
      }
      await sleep(10000);
    }
  }

  async runAutoSwapTask(){
    const memories = await this.mongoService.client.db('agent').collection(AutoSwapTaskTable).find<Memory>({}).toArray();
    this.logger.log(`Running auto swap task for ${memories.length} tasks`);
      for await (const memory of memories){
      const {agentId} = memory as Memory;
      const {nftId, chain, aiAgent} = await this.mongoService.nfts.findOne({agentId});
      if (!nftId){
        continue
      }
      const { characterConfig } = await this.mongoService.nftConfigs.findOne({nftId: nftId});
      const character = await this.initAgentCharacter({
        nftId,
        chain,
        characterConfig,
        character: aiAgent.character,
      });
      try {
        const runtime = await newTradeAgentRuntime(character, this.mongoService.client);
        await executeAutoTokenSwapTask(runtime, memory);
      }catch (error) {
        this.logger.error(`Error during token swap:, ${error}`);
      }
    }
  }

  async initAgentCharacter(config : ElizaAgentConfig) {
    let {chain, nftId, character, characterConfig} = config;
    character = {
      ...character,
      ...characterConfig,
      modelProvider: this.appConfig.get<ModelProviderName>(
        'AGENT_MODEL_PROVIDER',
      ),
    };
    const envVars = this.getElizaEnvs();
    const salt = ElizaManagerService.getAgentSecretSalt(
      chain,
      nftId,
    );
    const teeMode = this.appConfig.get<string>('TEE_MODE');
    if (!character.settings){
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
    return character;
  }
}
