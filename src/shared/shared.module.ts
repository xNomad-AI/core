import { Global, Module } from '@nestjs/common';
import { TransientLoggerService } from './transient-logger.service.js';
import { PhalaService } from './phala.service.js';
import { NftgoService } from './nftgo.service.js';
import { HttpModule } from '@nestjs/axios';
import { MongoService } from './mongo/mongo.service.js';
import { BirdeyeService } from './birdeye.service.js';

@Global()
@Module({
  imports: [HttpModule],
  providers: [
    TransientLoggerService,
    PhalaService,
    NftgoService,
    MongoService,
    BirdeyeService,
  ],
  exports: [
    TransientLoggerService,
    PhalaService,
    NftgoService,
    MongoService,
    BirdeyeService,
  ],
})
export class SharedModule {}
