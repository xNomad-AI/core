import { CacheModule } from '@nestjs/cache-manager';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { ChatModule } from './chat/chat.module.js';
import { ApiKeyModule } from './api-keys/api-key.module.js';
import { ApiKeyMiddleware } from './api-keys/api-key.middleware.js';
import { AlphaModule } from './alpha/alpha.module.js';

EventEmitter.defaultMaxListeners = 10;

@Module({
  imports: [
    TaskManagerModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 10000,
      limit: 3,
    }]),
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
    ChatModule,
    ApiKeyModule,
    AlphaModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiKeyMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
}
