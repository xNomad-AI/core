import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Request,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { NftService } from './nft.service.js';
import { NftSearchQueryDto } from './nft.types.js';
import { CharacterConfig } from '../shared/mongo/types.js';
import { AuthGuard } from '../shared/auth/auth.guard.js';

@Controller('/nft')
export class NftController {
  constructor(private readonly nftService: NftService) {}

  @Post('/:chain/:nftId/claim-funds')
  async claimInitialFunds(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('signature') signature: string,
  ) {
    await this.nftService.claimInitialFunds({
      chain,
      nftId,
      ownerAddress,
      signature,
    });
  }

  @Get('/:chain/collections')
  async getCollections(@Param('chain') chain: string) {
    return await this.nftService.getCollections(chain);
  }

  @Get('/:chain/collections/:collectionId')
  async getCollectionById(
    @Param('chain') chain: string,
    @Param('collectionId') collectionId: string,
  ) {
    return await this.nftService.getCollectionById(chain, collectionId);
  }

  @Get('/:chain/collections/:collectionId/filter-template')
  async getFilterTemplate(
    @Param('chain') chain: string,
    @Param('collectionId') collectionId: string,
  ) {
    return await this.nftService.getFilterTemplate(chain, collectionId);
  }


  @Get('/:chain/collection/:id/metrics')
  async getCollectionMetrics(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
  ) {
    return await this.nftService.getCollectionMetrics(chain, collectionId);
  }

  @Get('/:chain/collection/:id/nfts')
  async getNfts(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
    @Query() query: NftSearchQueryDto,
  ) {
    return await this.nftService.getNfts({
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

  @Get('/:chain/nfts/:nftId')
  async getNftById(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    return await this.nftService.getNftById(chain, nftId);
  }

  // @UseGuards(AuthGuard)
  @Post('/:chain/:nftId/config')
  async setNftConfig(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() { characterConfig }: { characterConfig: CharacterConfig },
  ) {
    return await this.nftService.updateNftConfig({
      nftId,
      characterConfig,
    });
  }

  // @UseGuards(AuthGuard)
  @Get('/:chain/:nftId/config')
  async getNftConfig(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    return await this.nftService.getNftConfig(nftId);
  }

  @Delete('/:chain/:nftId/config')
  async deleteNftConfig(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    await this.nftService.deleteNftConfig(nftId);
  }

  @UseGuards(AuthGuard)
  @Get('/agent/auth')
  async getAgentAuth(
    @Query('agentId') agentId: string,
    @Request() request,
  ) {
    const address = request['X-USER-ADDRESS'];
    const chain = request['X-USER-CHAIN'];
    if (!chain || !address) {
      throw new UnauthorizedException('Invalid auth header');
    }
    const owner = await this.nftService.getAgentOwner(agentId);
    return {
      isAdmin: owner?.ownerAddress === address,
    };
  }
}
