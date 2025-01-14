import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { Character } from '@elizaos/core';
import { ConfigService } from '@nestjs/config';
import { PhalaService } from '../shared/phala.service.js';
import { writeFileSync } from 'node:fs';
import { startAgent } from '../eliza/starter/index.js';
import { DirectClient } from '@elizaos/client-direct';
import { fileURLToPath } from 'url';
import path from 'path';
import { UtilsService } from '../shared/utils.service.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ElizaAgentConfig = {
  chain: 'solana' | string;
  nftId: string;
  character: Character;
  agentSettings?: { [key: string]: string }
};

@Injectable()
export class ElizaManagerService {
  private elizaClient = new DirectClient();

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly phala: PhalaService,
  ) {
    logger.setContext(ElizaManagerService.name);
  }


  async startAgentServer(){
    this.elizaClient.start(this.appConfig.get<number>('AGENT_SERVER_PORT'));
  }

  async startNftAgent(config: ElizaAgentConfig) {
    return await this.startAgentLocal(config);
  }

  async startAgentLocal(config: ElizaAgentConfig) {
    const envVars = this.getElizaEnvs();
    envVars['WALLET_SECRET_SALT'] = `${config.chain}:${config.nftId}`;
    envVars['TEE_MODE'] =  this.appConfig.get<string>('TEE_MODE');
    // Set unique runtime environment variables for each agent
    config.character.settings.secrets = {...envVars, ...config.agentSettings};
    startAgent(config.character, this.elizaClient);
    this.elizaClient.startAgent = async (character: Character) => {
      // wrap it so we don't have to inject directClient later
      return startAgent(character, this.elizaClient);
    };
  }

  getElizaEnvs(): Record<string, string> {
    const elizaEnvPath = path.resolve(__dirname, '../../.env.agent-eliza')
    return UtilsService.getEnvFromFile(elizaEnvPath);
  }

  createCharacterFile(character: Character, filename: string) {
    const filepath = `../eliza/${filename}.json`;
    writeFileSync(filepath, JSON.stringify(character));
    return filepath;
  }
}
