import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { readFileSync } from 'fs';
import { Character } from '@elizaos/core';
import { ConfigService } from '@nestjs/config';
import { PhalaService } from '../shared/phala.service.js';
import { writeFileSync } from 'node:fs';
import { startAgent } from '../eliza/starter/index.js';
import { DirectClient } from '@elizaos/client-direct';

export type ElizaAgentConfig = {
  chain: 'solana' | string;
  nftId: string;
  character: Character;
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

  async startNftAgent(config: ElizaAgentConfig) {
    return await this.startAgentNative(config);
  }

  async startAgentNative(config: ElizaAgentConfig) {
    const envVars = this.getElizaEnvs();
    envVars.set('WALLET_SECRET_SALT', `${config.chain}:${config.nftId}`);
    envVars.set('TEE_MODE', this.appConfig.get<string>('TEE_MODE'));
    // Set unique runtime environment variables for each agent
    config.character.settings.secrets = Object.fromEntries(envVars);
    startAgent(config.character, this.elizaClient);
  }

  getElizaEnvs(): Map<string, string> {
    const envFileContent = readFileSync('../eliza/.env', 'utf-8');
    const envVars = envFileContent
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((line) => {
        const [key, value] = line.split('=');
        if (key && value) {
          return [key.trim(), value.trim()] as [string, string];
        }
        return null;
      })
      .filter((item): item is [string, string] => item !== null);
    return new Map(envVars);
  }

  createCharacterFile(character: Character, filename: string) {
    const filepath = `../eliza/${filename}.json`;
    writeFileSync(filepath, JSON.stringify(character));
    return filepath;
  }
}
