import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { TransientLoggerService } from './transient-logger.service.js';
import {
  ListNFTParams,
  BidNFTParams,
  AcceptOfferParams,
  CancelListingParams,
  CancelOfferParams,
} from '../order/order.types.js';

@Injectable()
export class MagicEdenService {
  private readonly baseUrl: string;
  private readonly auctionHouseAddress: string;

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.logger.setContext(MagicEdenService.name);
    this.baseUrl = this.configService.get<string>('MAGIC_EDEN_BASE_URL');
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

   /**
   * Bids on an NFT on Magic Eden
   */
   async bidNFT(params: BidNFTParams): Promise<any> {
    const { buyerAddress, tokenMintAddress, price } = params;
    const endpoint = `${this.baseUrl}/buy?buyer=${buyerAddress}&tokenMint=${tokenMintAddress}&price=${price}&auctionHouseAddress=${this.auctionHouseAddress}`;
    this.logger.log(`Bidding on NFT on Magic Eden: ${endpoint}`);

    return this.fetchOrderData(endpoint);
  }

  /**
   * Accepts an offer on an NFT on Magic Eden
   */
  async sellNow(params: AcceptOfferParams): Promise<any> {
    const {
      buyerAddress,
      sellerAddress,
      tokenMintAddress,
      tokenATAAddress,
      price,
      newPrice,
      sellerExpiry,
    } = params;
  
    const endpoint = `${this.baseUrl}/sell_now?buyer=${buyerAddress}&seller=${sellerAddress}&tokenMint=${tokenMintAddress}&tokenATA=${tokenATAAddress}&price=${price}&newPrice=${newPrice}&sellerExpiry=${sellerExpiry}`;
  
    this.logger.log(`Accepting offer on Magic Eden: ${endpoint}`);
    return this.fetchOrderData(endpoint);
  }




  /**
   * Cancels a sell on Magic Eden
   */
  async cancelSell(params: CancelListingParams): Promise<any> {
    const {
      sellerAddress,
      tokenMintAddress,
      tokenAccountAddress,
      price,
    } = params;
  
    const endpoint = `${this.baseUrl}/sell_cancel?seller=${sellerAddress}&tokenMint=${tokenMintAddress}&tokenAccount=${tokenAccountAddress}&price=${price}`;
  
    this.logger.log(`Canceling sell on Magic Eden: ${endpoint}`);
  
    return this.fetchOrderData(endpoint);
  }



  // core/src/shared/magiceden.service.ts
async cancelBuy(params: CancelOfferParams): Promise<any> {
  const {
    buyerAddress,
    tokenMintAddress,
    price,
  } = params;

  const endpoint = `${this.baseUrl}/buy_cancel?buyer=${buyerAddress}&tokenMint=${tokenMintAddress}&price=${price}`;

  this.logger.log(`Canceling buy on Magic Eden: ${endpoint}`);

  return this.fetchOrderData(endpoint);
}



}