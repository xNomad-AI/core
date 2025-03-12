import { Module } from '@nestjs/common';
import { CallbackController } from './callback.controller.js';
import { AgentModule } from '../agent/agent.module.js';

@Module({
  imports: [AgentModule],
  providers: [],
  controllers: [CallbackController],
  exports: [],
})
export class CallbackModule {}
