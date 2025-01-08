import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Injectable()
export class NftService implements OnApplicationBootstrap {
  constructor(private readonly logger: TransientLoggerService) {
    this.logger.setContext('NftService');
  }

  onApplicationBootstrap() {
    this.subscribeAINfts();
  }

  async subscribeAINfts(): Promise<void> {}

  async claimInitialFunds(chain: string, nftId: string) : Promise<void> {
    this.logger.log(`Claiming initial funds for NFT ${nftId}`);
    // check ownership
    // get nft private account
    // claim
  }
}
