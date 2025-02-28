import { Module } from '@nestjs/common';
import { CallbackController } from './callback.controller.js';

@Module({
  imports: [],
  providers: [],
  controllers: [CallbackController],
  exports: [],
})
export class CallbackModule {}
