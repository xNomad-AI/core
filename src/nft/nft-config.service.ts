import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TasksService } from '@xnomad/task-manager';

import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { CharacterConfigSecrets } from './interface/nft-config.interface.js';
import { getBotUsername } from '../utils/telegram.js';
import { NftConfig } from '../shared/mongo/types.js';

type NftConfigBetter = NftConfig & {
  characterConfig: {
    settings: {
      secrets: CharacterConfigSecrets;
    },
  },
}

function checkStartOrStopClientTwitter(nftConfig: NftConfigBetter): 'stop' | 'start' | undefined {
  if (
    !nftConfig.characterConfig?.settings?.secrets?.TWITTER_USERNAME ||
    (
      nftConfig.characterConfig?.settings?.secrets?.TWITTER_LOGIN_SUSPEND && 
      nftConfig.characterConfig.settings.secrets.TWITTER_LOGIN_SUSPEND === 'true'
    )
  ) {
    return 'stop';
  }

  if (
    (
      nftConfig.characterConfig?.settings?.secrets?.TWITTER_USERNAME &&
      nftConfig.characterConfig?.settings?.secrets?.TWITTER_LOGIN_SUSPEND && 
      nftConfig.characterConfig.settings.secrets.TWITTER_LOGIN_SUSPEND === 'false'
    ) || 
    (
      nftConfig.characterConfig?.settings?.secrets?.TWITTER_USERNAME &&
      nftConfig.characterConfig?.settings?.secrets?.TWITTER_LOGIN_SUSPEND === undefined
    )
  ) {
    return 'start';
  }
}

@Injectable()
export class NftConfigService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
    private tasksService: TasksService,
  ) {
  }

  private async getNftConfigs(): Promise<NftConfigBetter[]> {
    // TODO read all or read by currsor
    const nftConfigs = await this.mongo.nftConfigs.find({}).toArray();
    return nftConfigs as any;
  }

  private async getNftConfig(nftId: string): Promise<NftConfigBetter | null> {
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

  async startOrStopClientTwitter(nftConfig: NftConfig) {
    const { nftId } = nftConfig;

    const action = checkStartOrStopClientTwitter(nftConfig as NftConfigBetter);
    if (action === 'stop') {
      this.logger.debug(`stopTaskByNftId nftId: ${nftId}`);
      await this.tasksService.stopTaskByNftId(nftId);
    } else if (action === 'start') {
      this.logger.debug(`startTaskByNftId nftId: ${nftId}`);
      await this.tasksService.startTaskByNftId(nftId);
    } else {
      this.logger.warn(`startOrStopClientTwitter no action for nftId: ${nftId}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async syncClientTwitterTaskAction() {
    // using this cron to sync the task action
    // so that even if the twitter nft config is removed from db.nftConfigs
    // the task action in ClientTwitterTask is still valid
    const prefix = 'syncClientTwitterTaskAction';
    this.logger.log(`${prefix} start`);

    const nftConfigs = await this.getNftConfigs();
    for (const nftConfig of nftConfigs) {
      await this.startOrStopClientTwitter(nftConfig);
    }

    this.logger.log(`${prefix} end, nftConfigs: ${nftConfigs.length}`);
  }
}
