import { Controller, Get, Query } from '@nestjs/common';
import { ElizaManagerService } from './eliza-manager.service.js';
import { BirdeyeService } from '../shared/birdeye.service.js';

@Controller('/agent-account')
export class AgentAccountController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly birdEye: BirdeyeService,
  ) {}

  @Get('/')
  async getAgentAccount(
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

  @Get('/defi/txs')
  async getTxs(
    @Query('chain') chain: string,
    @Query('address') address: string,
    @Query('beforeTime')beforeTime: number,
    @Query('afterTime') afterTime: number,
    @Query('limit') limit: number,
  ) {
    return await this.birdEye.getTxs({address, afterTime, beforeTime, limit});
  }

  @Get('/defi/portfolio')
  async getPortfolio(
    @Query('chain') chain: string,
    @Query('address') address: string
  ) {
    return await this.birdEye.getWalletPortfolio({chain, address});
  }
}
