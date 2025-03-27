import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SettingsService } from '../nft/core-settings.service.js';
import { NftConfigService } from '../nft/nft-config.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AgentAccountController } from './agent-account.controller.js';
import { AgentController } from './agent.controller.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Module({
  imports: [WalletModule, HttpModule],
  providers: [ElizaManagerService, SettingsService, NftConfigService],
  controllers: [AgentController, AgentAccountController],
  exports: [ElizaManagerService],
})
export class AgentModule {}
