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
    this.limitOrderCallbackUrl = `${this.appConfig.get<string>('TRADE_MONITOR_CALLBACK_URL')}/limitOrder_callback`; // todo @everimbaq: add limit_order_callback route
    this.copyTradeCallbackUrl = `${this.appConfig.get<string>('TRADE_MONITOR_CALLBACK_URL')}/copyTrade_callback`; // todo @everimbaq: add copy_trade_callback route
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
}
