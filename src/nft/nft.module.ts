import { Module } from '@nestjs/common';
import { NftService } from './nft.service.js';
import { NftController } from './nft.controller.js';
import { AgentModule } from '../agent/agent.module.js';

@Module({
  imports: [AgentModule],
  providers: [NftService],
  controllers: [NftController],
  exports: [],
})
export class NftModule {}
