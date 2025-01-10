import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from './transient-logger.service.js';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export class NftgoAICollection {
  id: string;
  name: string;
  created_at: string;
}

export class NftgoAINftsResponse {
  next_cursor: string;
  nfts: NftgoAINft[];
}

export class NftgoAINft {
  nft_id: string;
  chain: string;
  contract_address: string;
  token_id: string;
  owner_addresses: string[];
  collection_name: string;
  name: string;
  description: string;
  image: string;
  traits: {
    type: string;
    value: string;
  }[];
  rarity: {
    score: number;
    rank: number;
  };
  created: {
    minted_to: string;
    quantity: number;
    timestamp: number;
    block_number: number;
    transaction: string;
  };
  last_sale: {
    tx_hash: string;
    price_token: number;
    token_symbol: string;
    token_contract_address: string;
    price: {
      value: number;
      crypto_unit: string;
      payment_token: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
    time: number;
  };
}

export class AICollectionMetrics {
  collection_id: string;
  collection_name: string;
  circulating_supply: number;
  market_cap: {
    value: number;
    raw_value: number;
    usd: number;
    payment_token: {
      address: string;
      symbol: string;
      decimals: number;
    };
  };
  volume: {
    '24h': {
      value: number;
      raw_value: number;
      usd: number;
      payment_token: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
    '7d': {
      value: number;
      raw_value: number;
      usd: number;
      payment_token: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
    '30d': {
      value: number;
      raw_value: number;
      usd: number;
      payment_token: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
    all: {
      value: number;
      raw_value: number;
      usd: number;
      payment_token: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
  };
  buyer_num: {
    '24h': number;
    '7d': number;
    '30d': number;
  };
  seller_num: {
    '24h': number;
    '7d': number;
    '30d': number;
  };
  trader_num: {
    '24h': number;
    '7d': number;
    '30d': number;
  };
  transfer_num: {
    '24h': number;
    '7d': number;
    '30d': number;
  };
  holder_num: number;
  floor_price: {
    value: number;
    raw_value: number;
    usd: number;
    payment_token: {
      address: string;
      symbol: string;
      decimals: number;
    };
  };
}

@Injectable()
export class NftgoService {
  private endpoint: string;
  private apikey: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.appConfig.get<string>('NFTGO_ENDPOINT')!;
    this.apikey = this.appConfig.get<string>('NFTGO_API_KEY')!;
  }

  async getCollectionMetrics(
    collectionId: string,
  ): Promise<AICollectionMetrics> {
    const url = `${this.endpoint}/v1/collection/metrics?collection_id=${collectionId}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data as AICollectionMetrics;
  }

  async getAICollections(): Promise<NftgoAICollection[]> {
    const url = `${this.endpoint}/v1/ai-collections`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data as NftgoAICollection[];
  }

  async getAINftsByCollection(
    collectionId: string,
    options?: {
      limit?: number;
      cursor?: string;
    },
  ) {
    const url = `${this.endpoint}/v1/ai-collection/nfts`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
      },
      params: {
        limit: options?.limit,
        cursor: options?.cursor,
        collection_id: collectionId,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data as NftgoAINftsResponse;
  }
}
