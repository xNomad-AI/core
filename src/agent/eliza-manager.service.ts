import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { Character } from '@elizaos/core';
import { ConfigService } from '@nestjs/config';
import { PhalaService } from '../shared/phala.service.js';
import { startAgent } from '../eliza/starter/index.js';
import { DirectClient } from '@elizaos/client-direct';
import { fileURLToPath } from 'url';
import path from 'path';
import { UtilsService } from '../shared/utils.service.js';
import { DeriveKeyProvider } from '@elizaos/plugin-tee';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ElizaAgentConfig = {
  chain: string;
  nftId: string;
  character: Character;
  agentSettings?: { [key: string]: string };
};

@Injectable()
export class ElizaManagerService {
  private elizaClient: DirectClient;

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly phala: PhalaService,
  ) {
    logger.setContext(ElizaManagerService.name);
    this.elizaClient = new DirectClient();
    this.elizaClient.startAgent = async (character: Character) => {
      // wrap it so we don't have to inject directClient later
      return startAgent(character, this.elizaClient);
    };
  }

   startAgentServer() {
    this.elizaClient.start(this.appConfig.get<number>('AGENT_SERVER_PORT'));
  }

  async startAgentLocal(config: ElizaAgentConfig) {
    const envVars = this.getElizaEnvs();
    envVars['WALLET_SECRET_SALT'] = ElizaManagerService.getAgentSecretSalt(
      config.chain,
      config.nftId,
    );
    envVars['TEE_MODE'] = this.appConfig.get<string>('TEE_MODE');
    // Set unique runtime environment variables for each agent
    config.character.settings.secrets = { ...envVars, ...config.agentSettings };
    await startAgent(config.character, this.elizaClient);
  }

  getElizaEnvs(): Record<string, string> {
    const elizaEnvPath = path.resolve(__dirname, '../../.env.agent-eliza');
    return UtilsService.getEnvFromFile(elizaEnvPath);
  }

  static getAgentSecretSalt(chain: string, nftId: string) {
    return `${chain}:${nftId}`;
  }

  async getAgentAccount(
    chain: string,
    nftId: string,
    agentId: string,
  ): Promise<{ solana: string; evm: string }> {
    const provider: DeriveKeyProvider = new DeriveKeyProvider(
      this.appConfig.get<string>('TEE_MODE'),
    );
    const secrectSalt = ElizaManagerService.getAgentSecretSalt(chain, nftId);
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
