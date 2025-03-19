import {
  Body,
  Controller,
  Post,
  Param,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { OrderService } from './order.service.js';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import {
  ListNFTDto,
} from './order.dto.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Controller('/order')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly mongo: MongoService,
    private readonly logger: TransientLoggerService,
  ) {
    this.logger.setContext(OrderController.name);
  }

  @UseGuards(AuthGuard)
  @Post('/:chain/nfts/:nftId/list')
  async listNFT(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() dto: ListNFTDto, @Request() request) {
    
    const address = request['X-USER-ADDRESS'];
    
    console.log(`X-USER-ADDRESS: ${address}`);
  


    // Verify NFT ownership
    await this.orderService.verifyNftOwnership(chain, address, nftId);
    
    if (chain !== 'solana') {
      throw new NotFoundException('Only Solana chain is supported for now.');
    }

    const nft = await this.mongo.nfts.findOne({
      'agentAccount.solana': dto.tokenMintAddress,
    });
    if (!nft) {
      throw new NotFoundException('NFT not found');
    }

    // Use MagicEdenService to fetch order data
    const tx = await this.orderService.listNFT({
      sellerAddress: address,
      tokenMintAddress: dto.tokenMintAddress,
      tokenAccountAddress: dto.tokenAccountAddress,
      price: dto.price,
    }, nft.nftId, nft.tokenId, chain);

    // Send order details to frontend for signing
    return { tx }; // serialized order that needs to be signed
  }

} 