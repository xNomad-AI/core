import { Body, Controller, Post } from '@nestjs/common';
import { CreateAgentDto } from './agent.types.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Controller('/agent')
export class AgentController {
  constructor(private readonly elizaManager: ElizaManagerService) {}

  @Post('/')
  async startNFTAgent(@Body() body: CreateAgentDto) {
    await this.elizaManager.startAgentLocal(body);
  }
}
