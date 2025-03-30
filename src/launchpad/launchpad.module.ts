import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { EvmLaunchCoinService } from './evm/evm-launch-coin.service.js';
import { EvmLaunchpadService } from './evm/evm-launchpad.service.js';
import { LaunchCoinService } from './launch-coin.service.js';
import { LaunchpadController } from './launchpad.controller.js';
import { LaunchpadService } from './launchpad.service.js';
import { SetupSwarmService } from './setup-swarm.service.js';
import { SwarmController } from './swarm.controller.js';
import { SwarmService } from './swarm.service.js';

@Module({
  imports: [HttpModule, AgentModule],
  providers: [
    LaunchpadService,
    LaunchCoinService,
    SwarmService,
    SetupSwarmService,
    EvmLaunchpadService,
    EvmLaunchCoinService,
  ],
  controllers: [LaunchpadController, SwarmController],
  exports: [],
})
export class LaunchpadModule {}
