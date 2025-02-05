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
import { fileURLToPath } from 'url';
import path from 'path';
import { UtilsService } from '../shared/utils.service.js';
import { DeriveKeyProvider } from '@elizaos/plugin-tee';
import { CharacterConfig } from '../shared/mongo/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  ) {
    logger.setContext(ElizaManagerService.name);
    this.elizaClient = new DirectClient();
    this.elizaClient.startAgent = async (
      character: Character,
      nftId?: string,
    ) => {
      return startAgent(character, this.elizaClient, nftId);
    };
  }

  startAgentServer() {
    this.elizaClient.start(this.appConfig.get<number>('AGENT_SERVER_PORT'));
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
      config.character.settings.secrets = {
        ...envVars,
        ...config.character.settings.secrets,
        TEE_MODE: this.appConfig.get<string>('TEE_MODE'),
        WALLET_SECRET_SALT: ElizaManagerService.getAgentSecretSalt(
          config.chain,
          config.nftId,
        ),
      };
      await startAgent(config.character, this.elizaClient, config.nftId);
    } catch (e) {
      this.logger.error(
        `Failed to start agent for NFT ${config.nftId}: ${e.message}`,
      );
    }
  }

  getElizaEnvs(): Record<string, string> {
    const elizaEnvPath = path.resolve(__dirname, '../../.env.agent-eliza');
    return UtilsService.getEnvFromFile(elizaEnvPath);
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
