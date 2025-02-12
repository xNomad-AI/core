import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module.js';
import { AgentAccountController } from './agent-account.controller.js';
import { AgentController } from './agent.controller.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Module({
  imports: [WalletModule],
  providers: [ElizaManagerService],
  controllers: [AgentController, AgentAccountController],
  exports: [ElizaManagerService],
})
export class AgentModule {}
