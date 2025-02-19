import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TransientLoggerService } from './transient-logger.service.js';

interface TokenBasicInfoResponse {
  address: string;
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
  maxSupply: string;
  chain: string;
}

interface TokenInfoResponse {
  address: string;
  aiSummary: string;
  chain: string;
  symbol: string;
  marketCap: number;
  volume24h: number;
  price: number;
  liquidity: number;
  holder: number;
  priceChange1h: number;
  logo: string;
}

interface TokenTwitterInfoResponse {
  followers_count: number;
  influencers_count: number;
  projects_count: number;
  venture_capitals_count: number;
  user_protected: boolean;
  lastUpdatedAt: number;
  id: string;
  name: string;
  screen_name: string;
  description: string;
  friends_count: number;
  register_date: string;
  tweets_count: number;
  banner: string;
  verified: boolean;
  avatar: string;
  can_dm: boolean;
  tokenInfo: {
    tokenAddress: string;
    symbol: string;
    name: string;
  };
}

interface TokenNewsResponse {
  id: number;
  token_address: string;
  symbol: string;
  network: string;
  tweet_id: string;
  user_id: string;
  text: string;
  medias: string[];
  is_self_send: boolean;
  is_retweet: boolean;
  is_quote: boolean;
  is_reply: boolean;
  is_like: boolean;
  related_tweet_id: string;
  related_user_id: string;
  favorite_count: number;
  quote_count: number;
  reply_count: number;
  retweet_count: number;
  author: string;
  user: {
    icon: string;
    name: string;
    id_str: string;
    location: string;
    verified: boolean;
    following: boolean;
    created_at: string;
    description: string;
    media_count: number;
    screen_name: string;
    friends_count: number;
    statuses_count: number;
    followers_count: number;
    favourites_count: number;
    is_blue_verified: boolean;
    profile_image_url_https: string;
  };
  created_at: string;
  updated_at: string;
  created_time: number;
  link: string;
  media_type: string;
  token_image: string;
  views: number;
  is_official: boolean;
  text_zh: string;
  validity: number;
}

@Injectable()
export class TokenInfoService {
  private endpoint: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.appConfig.get<string>('TOKEN_INFO_SERVICE_ENDPOINT')!;
  }

  async getTokenBasicInfo(
    tokenAddress: string,
  ): Promise<TokenBasicInfoResponse> {
    try {
      const config = {
        method: 'GET',
        url: `${this.endpoint}/api/v1/public/token/basic/info/${tokenAddress}`,
      };
      const response = await firstValueFrom(this.httpService.request(config));
      const tokenInfoResponse = response.data as TokenBasicInfoResponse;

      return tokenInfoResponse;
    } catch (e) {
      this.logger.error(`Failed to get token basic info: ${e}`);
      throw e;
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfoResponse> {
    try {
      const config = {
        method: 'GET',
        url: `${this.endpoint}/api/v1/public/token/info/${tokenAddress}`,
      };
      const response = await firstValueFrom(this.httpService.request(config));
      const tokenInfoResponse = response.data as TokenInfoResponse;

      return tokenInfoResponse;
    } catch (e) {
      this.logger.error(`Failed to get token info: ${e}`);
      throw e;
    }
  }

  async getTokenTwitterInfo(
    tokenAddress: string,
  ): Promise<TokenTwitterInfoResponse> {
    try {
      const config = {
        method: 'GET',
        url: `${this.endpoint}/api/v1/public/token/twitter/${tokenAddress}`,
      };
      const response = await firstValueFrom(this.httpService.request(config));
      const tokenTwitterInfoResponse =
        response.data as TokenTwitterInfoResponse;

      return tokenTwitterInfoResponse;
    } catch (e) {
      this.logger.error(`Failed to get token twitter info: ${e}`);
      throw e;
    }
  }

  async getTokenNews(tokenAddress: string): Promise<TokenNewsResponse[]> {
    try {
      const config = {
        method: 'GET',
        url: `${this.endpoint}/api/v1/public/token/news/${tokenAddress}`,
      };
      const response = await firstValueFrom(this.httpService.request(config));
      const tokenTwitterInfoResponse = response.data as TokenNewsResponse[];

      return tokenTwitterInfoResponse;
    } catch (e) {
      this.logger.error(`Failed to get token news: ${e}`);
      throw e;
    }
  }
}
