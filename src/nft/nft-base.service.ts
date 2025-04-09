import { Injectable } from '@nestjs/common';

import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { NftConfig } from '../shared/mongo/types.js';

@Injectable()
export class NftBaseService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
  ) {
  }

  async getNftByNftId(nftId: string): Promise<NftConfig | null> {
    const nft = await this.mongo.nfts.findOne({
      nftId,
    });
    return nft;
  }
}
