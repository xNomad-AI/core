import { Module } from '@nestjs/common';
import { TokenController } from './token.controller.js';

@Module({
  imports: [],
  providers: [],
  controllers: [TokenController],
  exports: [],
})
export class TokenModule {}
