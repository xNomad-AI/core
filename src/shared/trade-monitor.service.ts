import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TransientLoggerService } from './transient-logger.service.js';

interface LimitOrderCreateResponse {
  id: number;
  tokenAddress: string;
  clientId: string;
  callbackUrl: string;
  conditionType: ConditionType;
  targetPrice: number;
  status: string;
  expiredAt: number;
}

interface CopyTradeCreateResponse {
  id: number;
  address: string;
  clientId: string;
  callbackUrl: string;
  status: string;
  expiredAt: number;
}

export const ConditionType = {
  ABOVE: 'ABOVE',
  BELOW: 'BELOW',
} as const;

export type ConditionType = (typeof ConditionType)[keyof typeof ConditionType];

interface CreateOrderParams {
  tokenAddress: string;
  walletAddress: string;
  conditionType: ConditionType;
  targetPrice: number;
  expiredAt: number;
}

interface CreateCopyTradeParams {
  targetAddress: string;
  walletAddress: string;
  expiredAt: number;
}

export interface AgentCreatedToken {
  chain: string;
  address: string;
  creatorAddress: string;
  nftId: string;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  liquidity: number;
  marketCap: number;
  price: number;
  priceChange24h: number;
  volume24h: number;
  holdersCount: number;
  deployedTime: string;
  override?: {
    description: string;
    twitter: string;
    telegram: string;
    website: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GetAgentCreatedTokensResponse {
  list: AgentCreatedToken[];
}

@Injectable()
export class TradeMonitorService {
  private endpoint: string;
  private apikey: string;
  private limitOrderCallbackUrl: string;
  private copyTradeCallbackUrl: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.appConfig.get<string>(
      'TRADE_MONITOR_SERVICE_ENDPOINT',
    )!;
    this.apikey = this.appConfig.get<string>('TRADE_MONITOR_SERVICE_API_KEY')!;
    this.limitOrderCallbackUrl = `${this.appConfig.get<string>('TRADE_MONITOR_CALLBACK_URL')}/callbacks/limit-order`;
    this.copyTradeCallbackUrl = `${this.appConfig.get<string>('TRADE_MONITOR_CALLBACK_URL')}/callbacks/copy-trade`;
  }

  async createLimitOrder(
    params: CreateOrderParams,
  ): Promise<LimitOrderCreateResponse> {
    try {
      const config = {
        method: 'POST',
        url: `${this.endpoint}/price-monitors`,
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': this.apikey,
        },
        data: {
          ...params,
          clientId: params.walletAddress,
          callbackUrl: this.limitOrderCallbackUrl,
        },
      };
      const response = await firstValueFrom(this.httpService.request(config));
      const createResponse = response.data as LimitOrderCreateResponse;
      if (!createResponse.id) {
        throw new Error('Failed to create order');
      }
      this.logger.log(
        `Order created successfully, orderId: ${createResponse.id}`,
      );

      return createResponse;
    } catch (e) {
      this.logger.error(`Failed to create order: ${e}`);
      throw e;
    }
  }

  async cancelLimitOrder(orderId: number) {
    try {
      const config = {
        method: 'DELETE',
        url: `${this.endpoint}/price-monitors/${orderId}`,
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': this.apikey,
        },
      };
      const response = await firstValueFrom(this.httpService.request(config));
      if (response.status !== 200) {
        throw new Error('Failed to cancel order');
      }

      return;
    } catch (e) {
      this.logger.error(`Failed to cancel order: ${e}`);
      throw e;
    }
  }

  async createCopyTrade(
    params: CreateCopyTradeParams,
  ): Promise<CopyTradeCreateResponse> {
    try {
      const config = {
        method: 'POST',
        url: `${this.endpoint}/address-monitors`,
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': this.apikey,
        },
        data: {
          ...params,
          clientId: params.walletAddress,
          callbackUrl: this.copyTradeCallbackUrl,
        },
      };
      const response = await firstValueFrom(this.httpService.request(config));
      const createResponse = response.data as CopyTradeCreateResponse;
      if (!createResponse.id) {
        throw new Error('Failed to create copy trade');
      }
      this.logger.log(
        `Copy trade created successfully, CopyTradeId: ${createResponse.id}`,
      );

      return createResponse;
    } catch (e) {
      this.logger.error(`Failed to create copy trade: ${e}`);
      throw e;
    }
  }

  async cancelCopyTrade(orderId: number) {
    try {
      const config = {
        method: 'DELETE',
        url: `${this.endpoint}/address-monitors/${orderId}`,
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': this.apikey,
        },
      };
      const response = await firstValueFrom(this.httpService.request(config));
      if (response.status !== 200) {
        throw new Error('Failed to cancel copy trade');
      }

      return;
    } catch (e) {
      this.logger.error(`Failed to cancel copy trade: ${e}`);
      throw e;
    }
  }

  async registerAgentCreatedToken(params: {
    chain: string;
    address: string;
    creatorAddress: string;
    nftId: string;
    bound: boolean; // whether the token is bound to an nft
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/ai-agent-coin/register`,
          {
            chain: params.chain,
            address: params.address,
            creatorAddress: params.creatorAddress,
            nftId: params.nftId,
            bound: params.bound,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'API-KEY': this.apikey,
            },
          },
        ),
      );

      return response.data;
    } catch (e) {
      this.logger.error(`Failed to register agent created token: ${e}`);
      throw e;
    }
  }

  async getAgentCreatedTokens(params: {
    sortBy: 'deployedTime' | 'volume24h' | 'marketCap';
    sortOrder: 'desc' | 'asc';
    offset: number;
    limit: number;
    creatorAddress?: string;
    onlyBound?: boolean;
  }): Promise<GetAgentCreatedTokensResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/ai-agent-coin/coins`, {
          params: {
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
            offset: params.offset,
            limit: params.limit,
            creatorAddress: params.creatorAddress,
            ...(params.onlyBound ? { onlyBound: '1' } : {}),
          },
          headers: {
            'Content-Type': 'application/json',
            'API-KEY': this.apikey,
          },
        }),
      );
      return response.data;
    } catch (e) {
      this.logger.error(`Failed to get agent created tokens: ${e}`);
      throw e;
    }
  }

  async getAgentCreateToken(
    address: string,
  ): Promise<AgentCreatedToken | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/ai-agent-coin/coin`, {
          params: {
            address,
          },
          headers: {
            'Content-Type': 'application/json',
            'API-KEY': this.apikey,
          },
        }),
      );
      return response.data;
    } catch (e) {
      this.logger.error(`Failed to get agent created token: ${e}`);
      throw e;
    }
  }

  async refreshAgentCreatedToken(address: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/ai-agent-coin/refresh-coin`,
          {
            address,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'API-KEY': this.apikey,
            },
          },
        ),
      );
      return response.data;
    } catch (e) {
      this.logger.error(`Failed to refresh agent created token: ${e}`);
      throw e;
    }
  }

  async setOverrideMetadataForAgentCreatedToken(params: {
    address: string;
    metadata: {
      description: string;
      twitter: string;
      telegram: string;
      website: string;
    };
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/ai-agent-coin/set-override-metadata`,
          params,
          {
            headers: {
              'Content-Type': 'application/json',
              'API-KEY': this.apikey,
            },
          },
        ),
      );
      return response.data;
    } catch (e) {
      this.logger.error(
        `Failed to set override metadata for agent created token: ${e}`,
      );
      throw e;
    }
  }

  async bindAgentCreatedTokenToNft(params: { address: string }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/ai-agent-coin/bind-to-nft`,
          params,
          {
            headers: {
              'Content-Type': 'application/json',
              'API-KEY': this.apikey,
            },
          },
        ),
      );
      return response.data;
    } catch (e) {
      this.logger.error(`Failed to bind agent created token to nft: ${e}`);
      throw e;
    }
  }
}
