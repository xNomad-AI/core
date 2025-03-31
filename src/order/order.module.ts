import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { MagicEdenService } from '../shared/magiceden.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ConfigService } from '@nestjs/config';
@Module({
  imports: [HttpModule],
  controllers: [OrderController],
  providers: [
    OrderService,
    MagicEdenService,
    MongoService,
    TransientLoggerService,
    ConfigService,
  ],
})
export class OrderModule {} 