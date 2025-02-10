import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import {
  Character,
  Clients,
  ModelProviderName,
  stringToUuid,
} from '@elizaos/core';
import { ConfigService } from '@nestjs/config';
import { startAgent } from '../eliza/starter/index.js';
import { DirectClient } from '@elizaos/client-direct';
import { sleep } from '../shared/utils.service.js';
import { DeriveKeyProvider } from '@elizaos/plugin-tee';
import { CharacterConfig } from '../shared/mongo/types.js';
import { MongoService } from '../shared/mongo/mongo.service.js';

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
      // Set unique runtime environment variables for each agent
      config.character = {
        ...config.character,
        ...config.characterConfig,
        modelProvider: this.appConfig.get<ModelProviderName>(
          'AGENT_MODEL_PROVIDER',
        ),
      };
      const envVars = this.getElizaEnvs();
      const salt = ElizaManagerService.getAgentSecretSalt(
          config.chain,
          config.nftId,
        );
      const teeMode = this.appConfig.get<string>('TEE_MODE');
      if (!config.character.settings){
        config.character.settings = {};
      }
      config.character.settings.secrets = {
        ...envVars,
        ...config.character.settings?.secrets,
      };
      config.character.settings.secrets['TEE_MODE'] = teeMode;
      config.character.settings.secrets['WALLET_SECRET_SALT'] = salt;
      config.character.settings['TEE_MODE'] = teeMode;
      config.character.settings['WALLET_SECRET_SALT'] = salt;

      await startAgent(config.character, this.elizaClient, config.nftId, {mongoClient: this.mongoService.client});
    } catch (e) {
      this.logger.error(
        `Failed to start agent for NFT ${config.nftId}: ${e.message}`,
      );
    }
  }

  async deleteAgentMemory(agentId: string, opts?: {
    roomId?: string,
    userId?: string,
  }) {
    const filter: any = { agentId };
    if (opts.roomId) {
      filter.roomId = opts.roomId;
    }
    if (opts.userId) {
      filter.roomId = opts.userId;
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
}
