import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { TransientLoggerService } from './transient-logger.service.js';
import {
  ListNFTParams,
} from '../order/order.types.js';

@Injectable()
export class MagicEdenService {
  private readonly baseUrl: string;
  private readonly connection: Connection;
  private readonly auctionHouseAddress: string;

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.logger.setContext(MagicEdenService.name);
    this.baseUrl = this.configService.get<string>('MAGIC_EDEN_BASE_URL');
    this.connection = new Connection(this.configService.get<string>('SOLANA_RPC_URL'), 'confirmed');
    this.auctionHouseAddress = this.configService.get<string>('MAGIC_EDEN_AUCTION_HOUSE_ADDRESS');
  }

  /**
   * Fetches order data from a given endpoint
   */
  async fetchOrderData(endpoint: string): Promise<any> {
    try {
      this.logger.log(`Fetching order data from URL: ${endpoint}`);
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: {
            Authorization: `Bearer ${this.configService.get<string>('MAGIC_EDEN_API_KEY')}`,
          },
        })
      );

      if (!response || !response.data) {
        throw new Error('Failed to fetch order data');
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch order data: ${error.message}`);
      throw new Error(`Failed to fetch order data: ${error.message}`);
    }
  }

  /**
   * Lists an NFT on Magic Eden
   */
  async listNFT(params: ListNFTParams): Promise<any> {
    const { sellerAddress, tokenMintAddress, tokenAccountAddress, price } = params;
    const endpoint = `${this.baseUrl}/sell?seller=${sellerAddress}&tokenMint=${tokenMintAddress}&tokenAccount=${tokenAccountAddress}&price=${price}&auctionHouseAddress=${this.auctionHouseAddress}`;
    this.logger.log(`Listing NFT on Magic Eden: ${endpoint}`);

    return this.fetchOrderData(endpoint);
  }
}