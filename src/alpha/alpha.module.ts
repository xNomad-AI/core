import { Module } from '@nestjs/common';
import { AlphaController } from './alpha.controller.js';
import { AlphaService } from './alpha.service.js';

@Module({
  controllers: [AlphaController],
  providers: [AlphaService],
  exports: [AlphaService],
})
export class AlphaModule {}