import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module.js';
import { AgentAccountController } from './agent-account.controller.js';
import { AgentController } from './agent.controller.js';
import { ElizaManagerService } from './eliza-manager.service.js';
import { AgentTradeService } from './agent-trade.service.js';
@Module({
  imports: [WalletModule, HttpModule],
  providers: [ElizaManagerService, AgentTradeService],
  controllers: [AgentController, AgentAccountController],
  exports: [ElizaManagerService, AgentTradeService],
})
export class AgentModule {}
