import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WalletProxyService } from './wallet-proxy.service.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [HttpModule],
  providers: [WalletService, WalletProxyService],
  controllers: [WalletController],
  exports: [WalletProxyService],
})
export class WalletModule {}
