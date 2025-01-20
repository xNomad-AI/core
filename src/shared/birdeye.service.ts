import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from './transient-logger.service.js';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

class BirdEyeAPIResponse<T> {
  success: boolean;
  data: T;
}

export class WalletPortfolio {
  items: TokenPortfolio[];
  totalUsd: number;
}

export type DexTrades = {
  items: SwapTx[];
  hasNext: boolean;
};

export type SwapTx = {
  quote: {
    symbol: string;
    decimals: number;
    address: string;
    amount: number;
    type: string;
    type_swap: string;
    ui_amount: number;
    price: number | null;
    nearest_price: number;
    change_amount: number;
    ui_change_amount: number;
  };
  base: {
    symbol: string;
    decimals: number;
    address: string;
    amount: number;
    type: string;
    type_swap: string;
    fee_info: any;
    ui_amount: number;
    price: number | null;
    nearest_price: number;
    change_amount: number;
    ui_change_amount: number;
  };
  base_price: number | null;
  quote_price: number | null;
  tx_hash: string;
  source: string;
  block_unix_time: number;
  tx_type: 'mint_add_liquidity' | 'burn_remove_liquidity' | 'swap' | string;
  address: string;
  owner: string;
};

export class TokenPortfolio {
  address: string;
  decimals: number;
  balance: number;
  uiAmount: number;
  chainId: string;
  name?: string;
  symbol?: string;
  icon?: string;
  logoURI?: string;
  priceUsd?: number;
  valueUsd?: number;
}

@Injectable()
export class BirdeyeService {
  private endpoint: string;
  private apikey: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.appConfig.get<string>('BIRDEYE_ENDPOINT')!;
    this.apikey = this.appConfig.get<string>('BIRDEYE_API_KEY')!;
  }

  async getTxs(params: {
    address: string;
    beforeTime?: number;
    afterTime?: number;
    limit?: number;
  }) {
    const limit = params.limit || 100;
    const config = {
      method: 'GET',
      url: `${this.endpoint}/trader/txs/seek_by_time?address=${params.address}&tx_type=swap&before_time=${params.beforeTime || ''}&after_time=${params.afterTime || ''}&limit=${limit}`,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
      },
    };
    const response = await firstValueFrom(this.httpService.request(config));
    const birdEyeResponse = response.data as BirdEyeAPIResponse<DexTrades>;
    if (!birdEyeResponse.success) {
      throw new Error('Failed to getTxs');
    }
    const trades = birdEyeResponse.data;
    trades.items.sort((a, b) => b.block_unix_time - a.block_unix_time);
    return trades;
  }

  async getWalletPortfolio(params: { chain: string; address: string }) {
    const config = {
      method: 'GET',
      url: `${this.endpoint}/v1/wallet/token_list?wallet=${params.address}`,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
        'x-chain': params.chain,
      },
    };
    const response = await firstValueFrom(this.httpService.request(config));
    const birdEyeResponse =
      response.data as BirdEyeAPIResponse<WalletPortfolio>;
    if (!birdEyeResponse.success) {
      throw new Error('Failed to fetch wallet portfolio');
    }
    return birdEyeResponse.data;
  }
}
