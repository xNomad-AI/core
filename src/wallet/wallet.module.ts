import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [HttpModule],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [],
})
export class WalletModule {}
