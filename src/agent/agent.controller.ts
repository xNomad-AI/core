import { Body, Controller, Get, Headers, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { CreateAgentDto } from './agent.types.js';
import { ElizaManagerService } from './eliza-manager.service.js';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { CacheTTL } from '@nestjs/cache-manager';
import { ElevenlabsService } from '../shared/elevenlabs.service.js';

@Controller('/agent')
export class AgentController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly elevenlabs: ElevenlabsService,
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
  ) {}

  @Post('/')
  async startNFTAgent(@Body() body: CreateAgentDto) {
    await this.elizaManager.startAgentLocal(body);
  }

  @Get('/account')
  async getNftAccount(
    @Query('chain') chain: string,
    @Query('nftId') nftId: string,
    @Query('agentId') agentId: string,
  ) {
    const account = await this.elizaManager.getAgentAccount(
      chain,
      nftId,
      agentId,
    );
    return {
      account,
    };
  }

  @Get('/voices')
  @CacheTTL(3600)
  async getVoices() {
    return await this.elevenlabs.getVoices();
  }

}
