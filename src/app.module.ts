import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter } from 'events';
import { AddressModule } from './address/address.module.js';
import { AgentModule } from './agent/agent.module.js';
import { LaunchpadModule } from './launchpad/launchpad.module.js';
import { NftModule } from './nft/nft.module.js';
import { AuthModule } from './shared/auth/auth.module.js';
import { SharedModule } from './shared/shared.module.js';
import { WalletModule } from './wallet/wallet.module.js';
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
    NftModule,
    LaunchpadModule,
    WalletModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
