import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';

@Injectable()
export class NftConfigService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
  ) {
    this.logger.setContext(NftConfigService.name);
  }

  async updateNftTwitterHttpProxy(nftId: string, httpProxy: string) {
    return await this.mongo.nftConfigs.updateOne(
      { nftId },
      {
        $set: {
          'characterConfig.settings.secrets.TWITTER_HTTP_PROXY': httpProxy,
        },
      },
    );
  }
}
