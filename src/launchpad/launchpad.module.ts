import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { LaunchCoinService } from './launch-coin.service.js';
import { LaunchpadController } from './launchpad.controller.js';
import { LaunchpadService } from './launchpad.service.js';

@Module({
  imports: [AgentModule],
  providers: [LaunchpadService, LaunchCoinService],
  controllers: [LaunchpadController],
  exports: [],
})
export class LaunchpadModule {}
