import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CacheTTL } from '@nestjs/cache-manager';
import { testTwitterConfig } from '../shared/twitter.service.js';

@Controller('/nft')
export class NftController {
  constructor(private readonly nftService: NftService) {}

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

  @CacheTTL(10)
  @Get('/:chain/collection/:id/metrics')
  async getCollectionMetrics(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
  ) {
    return await this.nftService.getCollectionMetrics(chain, collectionId);
  }

  @CacheTTL(10)
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

  @CacheTTL(5)
  @Get('/:chain/address/:address/nfts')
  async getNftsByOwner(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('collectionId') collectionId: string,
  ) {
    return await this.nftService.getNftsByOwner(chain, address, collectionId);
  }

  @CacheTTL(15)
  @Get('/:chain/nfts/:nftId')
  async getNftById(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    return await this.nftService.getNftById(chain, nftId);
  }

  @Post('/:chain/:nftId/config/twitter')
  async updateTwitterConfig(
    @Request() request,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body()
    {
      testContent,
      characterConfig,
    }: { testContent: string; characterConfig: CharacterConfig },
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    const username = characterConfig.settings.secrets.TWITTER_USERNAME;
    const password = characterConfig.settings.secrets.TWITTER_PASSWORD;
    const email = characterConfig.settings.secrets.TWITTER_EMAIL;
    const twitter2faSecret =
      characterConfig.settings.secrets.TWITTER_2FA_SECRET;
    const result = await testTwitterConfig(
      username,
      password,
      email,
      twitter2faSecret,
      testContent,
    );
    if (!result.isLogin || !result.isPosted) {
      return result;
    }
    await this.nftService.updateNftConfig({ nftId, characterConfig });
    return result;
  }

  @UseGuards(AuthGuard)
  @Post('/:chain/:nftId/config')
  async setNftConfig(
    @Request() request,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() { characterConfig }: { characterConfig: CharacterConfig },
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    return await this.nftService.updateNftConfig({
      nftId,
      characterConfig,
    });
  }

  @UseGuards(AuthGuard)
  @Get('/:chain/:nftId/config')
  async getNftConfig(
    @Request() request,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    return await this.nftService.getNftConfig(nftId);
  }

  @UseGuards(AuthGuard)
  @Delete('/:chain/:nftId/config')
  async deleteNftConfig(
    @Request() request,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    await this.nftService.deleteNftConfig(nftId);
  }

  @UseGuards(AuthGuard)
  @Get('/agent/auth')
  async getAgentAuth(@Query('agentId') agentId: string, @Request() request) {
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
