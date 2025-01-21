import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateAgentDto } from './agent.types.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Controller('/agent')
export class AgentController {
  constructor(private readonly elizaManager: ElizaManagerService) {}

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
}
