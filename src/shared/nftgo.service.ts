import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TransientLoggerService } from './transient-logger.service.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class Collection {
  collection_id: string;
  name: string;
  blockchain: string;
  logo: string;
  hasRarity: boolean;
  description: string;
  totalsupply: number;
  categories?: string[];
  contracts?: string[];
}

export class CollectionNfts {
  next_cursor: string;
  nfts: Nft[];
}

export class Nft {
  blockchain: string;
  contract_address: string;
  token_id: string;
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
  collection: {
    collection_id: string;
  };
  extra_info: Record<string, unknown>;
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

export class CollectionTxs {
  next_cursor?: string;
  transactions: NftTx[];
}

export class NftTx {
  blockchain: string;
  from_address: string;
  to_address: string;
  action: string;
  quantity: number;
  tx_hash: string;
  time: number;
  block_number: number;
  nft: {
    contract_address: string;
    token_id: string;
    name: string;
    blockchain: string;
    image: string;
    contract_type: string;
  };
  price?: {
    value: number;
    crypto_unit: string;
    usd: number;
    eth_value: number;
    payment_token: {
      address: string;
      symbol: string;
      decimals: number;
    };
  };
}

export class CollectionMetrics {
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
  private proxyUrl: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.appConfig.get<string>('NFTGO_ENDPOINT');
    this.apikey = this.appConfig.get<string>('NFTGO_API_KEY');
    this.proxyUrl = this.appConfig.get<string>('CORE_HTTPS_PROXY');
  }

  get defaultHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apikey,
    };
  }

  private async request(endpoint: string, config?: Record<string, unknown>) {
    if (!config) {
      config = {
        headers: this.defaultHeaders,
      };
    }

    if (this.proxyUrl) {
      config = {
        ...config,
        httpsAgent: new HttpsProxyAgent(this.proxyUrl)
      };
    }

    const url = new URL(endpoint, this.endpoint).toString();
    try {
      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch ${url}, resp: ${error.response?.data}`, error);
      throw error;
    }
  }

  async getCollectionMetrics(collectionId: string): Promise<CollectionMetrics> {
    return this.request(`/v1/collection/metrics?collection_id=${collectionId}`);
  }

  // ids: comma separated collection ids
  async getAICollections(chain: string, cids: string): Promise<Collection[]> {
    const config = {
      headers: this.defaultHeaders,
      params: {
        cids,
      },
    };
    return (await this.request(`/${chain}/v1/collections/ids`, config)).collections;
  }

  async getCollectionTxs(
    _chain: string,
    collectionId: string,
    options?: {
      limit?: number;
      startTime?: number;
      cursor?: string;
    },
  ): Promise<CollectionTxs> {
    const config = {
      headers: this.defaultHeaders,
      params: {
        limit: options?.limit,
        cursor: options?.cursor,
        start_time: options?.startTime || undefined,
        collection_id: collectionId,
        actions: 'all',
        asc: true,
      },
    };
    return this.request(`/v1/history/collection/transactions`, config);
  }

  async getCollectionNfts(
    chain: string,
    collectionId: string,
    options?: {
      limit?: number;
      cursor?: string;
    },
  ): Promise<CollectionNfts> {
    const config = {
      headers: this.defaultHeaders,
      params: {
        limit: options?.limit,
        cursor: options?.cursor,
        collection_id: collectionId,
      },
    };
    return this.request(`/${chain}/v1/collection/nfts`, config);
  }
}
