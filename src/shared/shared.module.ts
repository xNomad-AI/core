import { HttpModule } from '@nestjs/axios';
import { Global, Module, OnModuleInit } from '@nestjs/common';
import { BirdeyeService } from './birdeye.service.js';
import { ElevenlabsService } from './elevenlabs.service.js';
import { MongoService } from './mongo/mongo.service.js';
import { NftgoService } from './nftgo.service.js';
import { TokenInfoService } from './token-info.service.js';
import { TradeMonitorService } from './trade-monitor.service.js';
import { TransientLoggerService } from './transient-logger.service.js';
import { ConfigModule } from '@nestjs/config';
import { SharedProvider as SolanaSharedProvider } from '@elizaos/plugin-solana';
import { SharedProvider as EvmSharedProvider } from '@elizaos/plugin-evm';

@Global()
@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [
    TransientLoggerService,
    NftgoService,
    MongoService,
    BirdeyeService,
    ElevenlabsService,
    TokenInfoService,
    TradeMonitorService,
  ],
  exports: [
    TransientLoggerService,
    NftgoService,
    MongoService,
    BirdeyeService,
    ElevenlabsService,
    TokenInfoService,
    TradeMonitorService,
  ],
})
export class SharedModule implements OnModuleInit {
  constructor(private readonly _tradeMonitorService: TradeMonitorService) {}

  onModuleInit() {
    SolanaSharedProvider.set('tradeMonitorService', this._tradeMonitorService);
    EvmSharedProvider.set('tradeMonitorService', this._tradeMonitorService);
  }
}
