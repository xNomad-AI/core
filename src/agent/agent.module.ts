import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Module({
  imports: [],
  providers: [ElizaManagerService],
  controllers: [AgentController],
  exports: [ElizaManagerService],
})
export class AgentModule {}
