import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from './transient-logger.service.js';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Collection, CollectionMetrics, CollectionNfts, CollectionTxs } from './nftgo.service.js';

@Injectable()
export class ElevenlabsService {
  private endpoint: string;
  private apikey: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apikey = this.appConfig.get<string>('ELEVENLABS_API_KEY');
    this.endpoint = "https://api.elevenlabs.io";
  }

  async getVoices(): Promise<CollectionMetrics> {
    const url = `${this.endpoint}/v1/voices`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apikey,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data;
  }

  // ids: comma separated collection ids
  async getAICollections(chain: string, cids: string): Promise<Collection[]> {
    const url = `${this.endpoint}/${chain}/v1/collections/ids`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
      },
      params: {
        cids,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data?.collections as Collection[];
  }

  async getCollectionTxs(
    _chain: string,
    collectionId: string,
    options?: {
      limit?: number;
      startTime?: number;
      cursor?: string;
    },
  ) {
    const url = `${this.endpoint}/v1/history/collection/transactions`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apikey,
      },
      params: {
        limit: options?.limit,
        cursor: options?.cursor,
        start_time: options?.startTime || undefined,
        collection_id: collectionId,
        actions: 'all',
        asc: true,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data as CollectionTxs;
  }

  async getCollectionNfts(
    chain: string,
    collectionId: string,
    options?: {
      limit?: number;
      cursor?: string;
    },
  ) {
    const url = `${this.endpoint}/${chain}/v1/collection/nfts`;
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
    return response.data as CollectionNfts;
  }
}