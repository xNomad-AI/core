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
  AcceptOfferDto,
  BidNFTDto,
  CancelListingDto,
  CancelOfferDto,
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
  @Post('/:chain/nfts/:nftId/listing')
  async listingNFT(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() dto: ListNFTDto, @Request() request) {
    
    const address = request['X-USER-ADDRESS'];
    
    // Verify NFT ownership
    // await this.orderService.verifyNftOwnership(chain, address, nftId);
    
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


  /**
   * Creates an offer on an NFT on Magic Eden
   */
  @UseGuards(AuthGuard)
  @Post('/:chain/nfts/:nftId/create-offer')
  async createOffer(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() dto: BidNFTDto, @Request() request) {
    
    const address = request['X-USER-ADDRESS'];
    
    if (chain !== 'solana') {
      throw new NotFoundException('Only Solana chain is supported for now.');
    }

    const nft = await this.mongo.nfts.findOne({
      'agentAccount.solana': dto.tokenMintAddress,
    });
    if (!nft) {
      throw new NotFoundException('NFT not found');
    }

    // Use MagicEdenService to fetch bid data
    const tx = await this.orderService.createOffer({
      buyerAddress: address,
      tokenMintAddress: dto.tokenMintAddress,
      price: dto.price,
    }, nft.nftId, nft.tokenId, chain);

    // Send bid details to frontend for signing
    return { tx }; // serialized bid that needs to be signed
  }


  /**
   * Accepts an offer on an NFT on Magic Eden
   */
  @UseGuards(AuthGuard)
@Post('/:chain/nfts/:nftId/accept-offer')
async acceptOffer(
  @Param('chain') chain: string,
  @Param('nftId') nftId: string,
  @Body() dto: AcceptOfferDto, @Request() request) {
  
  const address = request['X-USER-ADDRESS'];
  
  if (chain !== 'solana') {
    throw new NotFoundException('Only Solana chain is supported for now.');
  }

  const nft = await this.mongo.nfts.findOne({
    'agentAccount.solana': dto.tokenMintAddress,
  });
  if (!nft) {
    throw new NotFoundException('NFT not found');
  }

  // Use MagicEdenService to fetch accept offer data
  const tx = await this.orderService.acceptOffer({
    buyerAddress: dto.buyerAddress,
    sellerAddress: address,
    tokenMintAddress: dto.tokenMintAddress,
    tokenATAAddress: dto.tokenATAAddress,
    price: dto.price,
    newPrice: dto.newPrice,
    sellerExpiry: dto.sellerExpiry,
  }, nft.nftId, nft.tokenId, chain);

  // Send accept offer details to frontend for signing
  return { tx }; // serialized accept offer that needs to be signed
}


/**
 * Cancels a offer on Magic Eden
 */
@UseGuards(AuthGuard)
@Post('/:chain/nfts/:nftId/cancel-offer')
async cancelOffer(
  @Param('chain') chain: string,
  @Param('nftId') nftId: string,
  @Body() dto: CancelOfferDto, @Request() request) {
  
  const address = request['X-USER-ADDRESS'];
  
  if (chain !== 'solana') {
    throw new NotFoundException('Only Solana chain is supported for now.');
  }

  const nft = await this.mongo.nfts.findOne({
    'agentAccount.solana': dto.tokenMintAddress,
  });
  if (!nft) {
    throw new NotFoundException('NFT not found');
  }

  // Use MagicEdenService to fetch cancel buy data
  const tx = await this.orderService.cancelOffer({
    buyerAddress: address,
    tokenMintAddress: dto.tokenMintAddress,
    price: dto.price,
  });

  // Send cancel buy details to frontend for signing
  return { tx }; // serialized cancel buy that needs to be signed
}



/**
 * Cancels a listing on Magic Eden
 */
@UseGuards(AuthGuard)
@Post('/:chain/nfts/:nftId/cancel-listing')
async cancelListing(
  @Param('chain') chain: string,
  @Param('nftId') nftId: string,
  @Body() dto: CancelListingDto, @Request() request) {
  
  const address = request['X-USER-ADDRESS'];
  
  if (chain !== 'solana') {
    throw new NotFoundException('Only Solana chain is supported for now.');
  }

  const nft = await this.mongo.nfts.findOne({
    'agentAccount.solana': dto.tokenMintAddress,
  });
  if (!nft) {
    throw new NotFoundException('NFT not found');
  }

  // Use MagicEdenService to fetch cancel listing data
  const tx = await this.orderService.cancelListing({
    sellerAddress: address,
    tokenMintAddress: dto.tokenMintAddress,
    tokenAccountAddress: dto.tokenAccountAddress,
    price: dto.price,
  });

  // Send cancel listing details to frontend for signing
  return { tx }; // serialized cancel listing that needs to be signed
}

} 