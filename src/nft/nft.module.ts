import { Module } from '@nestjs/common';
import { TasksModule } from '@xnomad/task-manager';

import { NftService } from './nft.service.js';
import { NftController } from './nft.controller.js';
import { AgentModule } from '../agent/agent.module.js';
import { NftSyncService } from './nft-sync.service.js';
import { AddressModule } from '../address/address.module.js';
import { NftConfigService } from './nft-config.service.js';

@Module({
  imports: [AgentModule, AddressModule, TasksModule],
  providers: [NftService, NftSyncService, NftConfigService],
  controllers: [NftController],
  exports: [],
})
export class NftModule {}
