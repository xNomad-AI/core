import { Module } from '@nestjs/common';
import { NftService } from './nft.service.js';
import { NftController } from './nft.controller.js';
import { AgentModule } from '../agent/agent.module.js';
import { NftSyncService } from './nft-sync.service.js';

@Module({
  imports: [AgentModule],
  providers: [NftService, NftSyncService],
  controllers: [NftController],
  exports: [],
})
export class NftModule {}
