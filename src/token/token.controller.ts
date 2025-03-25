import { CacheTTL } from '@nestjs/cache-manager';
import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TokenInfoService } from '../shared/token-info.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Controller('/token')
export class TokenController {
  constructor(
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
    private mongo: MongoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly tokenInfo: TokenInfoService,
  ) {}

  @Get('/basic-info')
  async getTokenBasicInfo(@Query('tokenAddress') tokenAddress: string, @Query('chain') chain: string) {
    return await this.tokenInfo.getTokenBasicInfo(tokenAddress, chain);
  }

  @Get('/info')
  @CacheTTL(60)
  async getTokenInfo(@Query('tokenAddress') tokenAddress: string, @Query('chain') chain: string) {
    return await this.tokenInfo.getTokenInfo(tokenAddress, chain);
  }

  @Get('/twitter-info')
  @CacheTTL(3600)
  async getTokenTwitterInfo(@Query('tokenAddress') tokenAddress: string, @Query('chain') chain: string) {
    return await this.tokenInfo.getTokenTwitterInfo(tokenAddress, chain);
  }

  @Get('/news')
  @CacheTTL(60)
  async getTokenNews(@Query('tokenAddress') tokenAddress: string, @Query('chain') chain: string) {
    return await this.tokenInfo.getTokenNews(tokenAddress, chain);
  }

  @Get('/analyze')
  @CacheTTL(60)
  async getTokenAnalyze(
    @Query('tokenAddress') tokenAddress: string,
    @Query('chain') chain: string,
    @Query('type') type: string | string[],
  ) {
    const typeArray = Array.isArray(type) ? type : type?.split(',') || [];
    this.logger.log(`Analyze token ${tokenAddress} with types: ${typeArray}`);
    const results = await Promise.all(
      typeArray.map(async (t) => {
        switch (t) {
          case 'news':
            return { news: await this.tokenInfo.getTokenNews(tokenAddress, chain) };
          case 'twitter':
            return {
              twitter: await this.tokenInfo.getTokenTwitterInfo(tokenAddress, chain),
            };
          case 'info':
            return { info: await this.tokenInfo.getTokenInfo(tokenAddress, chain) };
          default:
            return {};
        }
      }),
    );
    return results.reduce((acc, res) => ({ ...acc, ...res }), {});
  }
}
