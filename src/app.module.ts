import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module.js';
import { SharedModule } from './shared/shared.module.js';
import { NftModule } from './nft/nft.module.js';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AddressModule } from './address/address.module.js';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 120,
    }),
    EventEmitterModule.forRoot(),
    AddressModule,
    AgentModule,
    SharedModule,
    NftModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
