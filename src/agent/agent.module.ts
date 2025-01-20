import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller.js';
import { ElizaManagerService } from './eliza-manager.service.js';
import { AgentAccountController } from './agent-account.controller.js';

@Module({
  imports: [],
  providers: [ElizaManagerService],
  controllers: [AgentController, AgentAccountController],
  exports: [ElizaManagerService],
})
export class AgentModule {}
