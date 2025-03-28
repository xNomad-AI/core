import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TransientLoggerService } from './transient-logger.service.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { ethAddress } from 'viem';

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

export interface BirdEyeSearchItemData {
  name: string;
  symbol: string;
  address: string;
  fdv: string;
  market_cap: string;
  liquidity: string;
  volume_24h_change_percent: string;
  price: string;
  price_change_24h_percent: string;
  network: string;
  buy_24h: string;
  buy_24h_change_percent: string;
  sell_24h: string;
  sell_24h_change_percent: string;
  trade_24h: string;
  trade_24h_change_percent: string;
  unique_wallet_24h: string;
  unique_view_24h_change_percent: string;
  last_trade_human_time: string;
  last_trade_unix_time: string;
  volume_24h_usd: string;
  logo_uri: string;
  verified: boolean;
}

export interface BirdERyeSearchData {
  type: string;
  result?: BirdEyeSearchItemData[];
}

export class TokenSearchResult {
  items: BirdERyeSearchData[];
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
    chain: string ;
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
        'x-chain': params.chain,
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

  async searchToken(params: {
    chain: string;
    query: string;
  }): Promise<BirdEyeSearchItemData[]> {
    const config = {
      method: 'GET',
      url: `${this.endpoint}/defi/v3/search`,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
        'x-chain': params.chain,
      },
      params: {
        keyword: params.query,
        chain: params.chain,
        target: 'token',
        sort_by: 'liquidity',
        sort_type: 'desc',
        offset: 0,
        limit: 20,
      },
    };

    const response = await firstValueFrom(this.httpService.request(config));
    const birdEyeResponse =
      response.data as BirdEyeAPIResponse<TokenSearchResult>;
    if (
      !birdEyeResponse.success ||
      !birdEyeResponse.data ||
      !birdEyeResponse.data.items ||
      birdEyeResponse.data.items.length < 1 ||
      birdEyeResponse.data.items[0].type !== 'token'
    ) {
      this.logger.log('Failed to search token');
      return [];
    }
    return birdEyeResponse.data.items[0].result;
  }

  transformNativeToken(chain: string, tokenCA: string) {
    if (chain === 'solana' && (tokenCA === '11111111111111111111111111111111' || tokenCA === 'So11111111111111111111111111111111')) {
      return NATIVE_MINT.toBase58();
    }
    if (chain === 'bsc' && tokenCA.toLocaleLowerCase() === ethAddress) {
      return '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'.toLowerCase(); // WBNB
    }
    return tokenCA;
  }

  async getTokenPrice(
    chain: string,
    tokenCA: string,
  ): Promise<number | undefined> {
    try {
      tokenCA = this.transformNativeToken(chain, tokenCA);
      const birdeyeApiKey = this.apikey;
      const url = `https://public-api.birdeye.so/defi/price?address=${tokenCA}`;
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': birdeyeApiKey,
          accept: 'application/json',
          'x-chain': chain,
        },
      });
      console.log(response);
      const result = await response.json();
      return result?.data?.value;
    } catch (error) {
      this.logger.error(`Error fetching token price: ${error}`);
      return undefined;
    }
  }
}
