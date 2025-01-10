import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NftService } from './nft.service.js';
import { NftSearchQueryDto } from './nft.types.js';

@Controller('/nft')
export class NftController {
  constructor(private readonly nftService: NftService) {}

  @Post('/:chain/:nftId/claim-funds')
  async claimInitialFunds(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    await this.nftService.claimInitialFunds(chain, nftId);
  }

  @Get('/:chain/collections')
  async getCollections(@Param('chain') chain: string) {
    await this.nftService.getCollections(chain);
  }

  @Get('/:chain/collection/:id/metrics')
  async getCollectionMetrics(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
  ) {
    await this.nftService.getCollectionMetrics(chain, collectionId);
  }

  @Get('/:chain/collection/:id/nfts')
  async getNfts(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
    @Query() query: NftSearchQueryDto,
  ) {
    await this.nftService.getNfts({
      chain,
      collectionId,
      ...query,
    });
  }

  @Get('/:chain/address/:address/nfts')
  async getNftsByOwner(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('collectionId') collectionId: string,
  ) {
    return await this.nftService.getNftsByOwner(chain, address, collectionId);
  }
}
