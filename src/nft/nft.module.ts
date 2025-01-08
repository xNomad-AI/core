import { Module } from '@nestjs/common';
import { NftService } from './nft.service.js';
import { NftController } from './nft.controller.js';

@Module({
  imports: [],
  providers: [NftService],
  controllers: [NftController],
  exports: [],
})
export class NftModule {}
