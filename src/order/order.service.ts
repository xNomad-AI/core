import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { MagicEdenService } from '../shared/magiceden.service.js';
import {
  Order,
  OrderStatus,
  OrderType,
  ListNFTParams,
} from './order.types.js';

@Injectable()
export class OrderService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
    private readonly magicEdenService: MagicEdenService,
  ) {
    this.logger.setContext(OrderService.name);
  }

  /**
   * Records an order in the database
   */
  private async recordOrder(
    txHash: string,
    nftId: string,
    chain: string,
    contractAddress: string,
    tokenId: string,
    type: OrderType,
    price: number,
    from: string,
    to: string,
    marketplace: string,
  ): Promise<Order> {
    const now = new Date();
    const order: Order = {
      txHash,
      nftId,
      chain,
      contractAddress,
      tokenId,
      type,
      status: OrderStatus.PENDING,
      price,
      from,
      to,
      timestamp: now,
      marketplace,
      updatedAt: now,
      createdAt: now,
    };

    await this.mongo.orders.insertOne(order);
    return order;
  }

  /**
   * Updates a order status
   */
  async updateOrderStatus(
    txHash: string,
    status: OrderStatus,
    blockNumber?: number,
  ): Promise<void> {
    await this.mongo.orders.updateOne(
      { txHash },
      {
        $set: {
          status,
          blockNumber,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Gets Orders for an NFT
   */
  async getOrders(
    nftId: string,
    type?: OrderType,
    limit = 20,
    cursor?: string,
  ): Promise<Order[]> {
    const query: any = { nftId };
    if (type) {
      query.type = type;
    }
    if (cursor) {
      query._id = { $lt: cursor };
    }

    return await this.mongo.orders
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }


  async verifyNftOwnership(chain: string, address: string, nftId: string): Promise<void> {
    const nft = await this.mongo.nfts.findOne({ nftId });
    if (!nft) {
      throw new UnauthorizedException('NFT not found');
    }

    const owner = await this.mongo.nftOwners.findOne({
      chain: nft.chain,
      contractAddress: nft.contractAddress,
      tokenId: nft.tokenId,
    });

    if (owner?.ownerAddress !== address) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
  }

  /**
   * Lists an NFT on Magic Eden
   */
  async listNFT(params: ListNFTParams, nftId: string, tokenId: string, chain: string): Promise<any> {
    try {
      const txData = await this.magicEdenService.listNFT(params);

      // Record the order in the database
      await this.recordOrder(
        txData.txHash,
        nftId,
        chain,
        params.tokenMintAddress,
        tokenId,
        OrderType.LIST,
        params.price,
        params.sellerAddress,
        '',
        'magiceden',
      );

      return txData;
    } catch (error) {
      this.logger.error(`Failed to list NFT: ${error.message}`);
      throw error;
    }
  }
} 