import { Module } from '@nestjs/common';
import { LaunchpadController } from './launchpad.controller.js';
import { LaunchpadService } from './launchpad.service.js';

@Module({
  imports: [],
  providers: [LaunchpadService],
  controllers: [LaunchpadController],
  exports: [],
})
export class LaunchpadModule {}
