import { Injectable } from '@nestjs/common';

import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { CharacterConfigSecrets } from './interface/nft-config.interface.js';
import { getBotUsername } from '../utils/telegram.js';
import { NftConfig } from '../shared/mongo/types.js';

@Injectable()
export class NftConfigService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
  ) {
  }

  private async getNftConfig(nftId: string): Promise<(NftConfig & {
    characterConfig: {
      settings: {
        secrets: CharacterConfigSecrets;
      };
    };
  }) | null> {
    const nftConfig = await this.mongo.nftConfigs.findOne({
      nftId,
    });
    return nftConfig as any;
  }

  private async updateNftConfigSecrets(nftId: string, field: keyof CharacterConfigSecrets, value: string) {
    const nftConfig = await this.mongo.nftConfigs.findOne({
      nftId,
    });
    const characterConfig: CharacterConfigSecrets = nftConfig?.characterConfig?.settings?.secrets;
    if (characterConfig) {
      return await this.mongo.nftConfigs.updateOne(
        { nftId },
        {
          $set: {
            [`characterConfig.settings.secrets.${field}`]: value,
          },
        },
      );
    }
  }

  async getNftBindingSocietyInfo(nftId: string, chain: string) {
    const nftConfig = await this.getNftConfig(nftId);
    const characterConfig: CharacterConfigSecrets = nftConfig?.characterConfig?.settings?.secrets;

    if (characterConfig && characterConfig.TELEGRAM_BOT_TOKEN && !characterConfig.TELEGRAM_BOT_USERNAME) {
      // TODO what if user update the tg bot token?
      const username = await getBotUsername(characterConfig.TELEGRAM_BOT_TOKEN, true);
      if (username) {
        characterConfig.TELEGRAM_BOT_USERNAME = username;
        await this.updateNftConfigSecrets(nftId, 'TELEGRAM_BOT_USERNAME', username);
      }
    }

    return {
      nftId,
      chain,
      twitterUsername: characterConfig?.TWITTER_USERNAME,
      telegramBotUsername: characterConfig?.TELEGRAM_BOT_USERNAME,
    }
  }
}
