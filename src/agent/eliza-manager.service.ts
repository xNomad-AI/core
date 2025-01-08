import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import Docker from 'dockerode';
import { readFileSync } from 'fs';
import { Character } from '@ai16z/eliza';
import { ConfigService } from '@nestjs/config';
import { PhalaService } from '../shared/phala.service.js';
import { writeFileSync } from 'node:fs';

export type ElizaAgentConfig = {
  chain: 'solana' | string;
  nftId: string;
  character: Character;
};

@Injectable()
export class ElizaManagerService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly phala: PhalaService,
  ) {
    logger.setContext(ElizaManagerService.name);
  }

  async startAgent(config: ElizaAgentConfig) {
    return await this.createLocalPod(config);
  }

  async createLocalPod(agentConfig: ElizaAgentConfig) {
    const envVars = this.getElizaEnvs();
    const nftSalt = `${agentConfig.chain}:${agentConfig.nftId}`;
    const characterFile = this.createCharacterFile(
      agentConfig.character,
      `${nftSalt}`,
    );
    envVars.set('WALLET_SECRET_SALT', nftSalt);
    envVars.set('TEE_MODE', 'LOCAL');

    const docker = new Docker();
    const container = await docker.createContainer({
      Image: 'xnomad/eliza:0.1.7',
      Tty: true,
      ExposedPorts: { '8080/tcp': {} },
      HostConfig: {
        PortBindings: { '8080/tcp': [{ HostPort: '8080' }] },
        Binds: [characterFile], // Mount JSON file
      },
      Env: [...envVars.values()],
      Cmd: ['pnpm', 'start', '--character', characterFile],
    });
    await container.start();
  }

  async createRemotePod(agentConfig: ElizaAgentConfig) {
    const envVars = this.getElizaEnvs();
    envVars.set(
      'WALLET_SECRET_SALT',
      `${agentConfig.chain}:${agentConfig.nftId}`,
    );
    envVars.set('TEE_MODE', 'PRODUCTION');
    const pod = await this.phala.createTeePod(agentConfig, [
      ...envVars.values(),
    ]);
    const pubkey = await this.phala.getPubkeyByPodId(pod.id.toString());
    return { ...pod, pubkey };
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
