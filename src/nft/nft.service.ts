import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { NftgoService } from '../shared/nftgo.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';

@Injectable()
export class NftService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongoService: MongoService,
  ) {
    this.logger.setContext('NftService');
  }

  onApplicationBootstrap() {
    this.subscribeAINfts().catch((e) => {
      this.logger.error(e);
    });
  }

  async subscribeAINfts(): Promise<void> {
    const collections = await this.nftgo.getAICollections();
    for (const collection of collections) {
      const result = await this.nftgo.getAINftsByCollection(collection.id);
      await this.mongoService.nfts.bulkWrite(
        result.nfts.map((nft) => ({
          updateOne: {
            filter: { id: nft.nft_id },
            update: { $set: nft },
            upsert: true,
          },
        })),
      );
    }
  }

  async claimInitialFunds(chain: string, nftId: string): Promise<void> {
    this.logger.log(`Claiming initial funds for NFT ${nftId}`);
    // check ownership
    // get nft private account
    // claim
  }
}
