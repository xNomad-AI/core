import { Global, Module } from '@nestjs/common';
import { TransientLoggerService } from './transient-logger.service.js';
import { PhalaService } from './phala.service.js';
import { NftgoService } from './nftgo.service.js';
import { HttpModule } from '@nestjs/axios';
import { MongoService } from './mongo/mongo.service.js';
import { BirdeyeService } from './birdeye.service.js';
import { ElevenlabsService } from './elevenlabs.service.js';

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
  ],
  exports: [
    TransientLoggerService,
    PhalaService,
    NftgoService,
    MongoService,
    BirdeyeService,
    ElevenlabsService,
  ],
})
export class SharedModule {}
