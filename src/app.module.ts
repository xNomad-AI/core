import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter } from 'events';
import { TaskManagerModule } from '@xnomad/task-manager';

import { AddressModule } from './address/address.module.js';
import { AgentModule } from './agent/agent.module.js';
import { CallbackModule } from './callback/callback.module.js';
import { LaunchpadModule } from './launchpad/launchpad.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { NftModule } from './nft/nft.module.js';
import { AuthModule } from './shared/auth/auth.module.js';
import { SharedModule } from './shared/shared.module.js';
import { TokenModule } from './token/token.module.js';
import { OrderModule } from './order/order.module.js';

EventEmitter.defaultMaxListeners = 10;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      ttl: 120,
    }),
    AuthModule,
    EventEmitterModule.forRoot(),
    AddressModule,
    AgentModule,
    SharedModule,
    TokenModule,
    NftModule,
    LaunchpadModule,
    MetricsModule,
    CallbackModule,
    OrderModule,
    TaskManagerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
