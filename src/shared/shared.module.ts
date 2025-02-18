import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { BirdeyeService } from './birdeye.service.js';
import { ElevenlabsService } from './elevenlabs.service.js';
import { MongoService } from './mongo/mongo.service.js';
import { NftgoService } from './nftgo.service.js';
import { PhalaService } from './phala.service.js';
import { TokenInfoService } from './token-info.service.js';
import { TradeMonitorService } from './trade-monitor.service.js';
import { TransientLoggerService } from './transient-logger.service.js';

@Global()
@Module({
  imports: [HttpModule],
  providers: [
    TransientLoggerService,
    PhalaService,
    NftgoService,
    MongoService,
    BirdeyeService,
    ElevenlabsService,
    TokenInfoService,
    TradeMonitorService,
  ],
  exports: [
    TransientLoggerService,
    PhalaService,
    NftgoService,
    MongoService,
    BirdeyeService,
    ElevenlabsService,
    TokenInfoService,
    TradeMonitorService,
  ],
})
export class SharedModule {}
