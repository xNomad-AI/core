import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LaunchpadService } from './launchpad.service.js';

@Controller('/launchpad')
export class LaunchpadController {
  constructor(
    private readonly launchpadService: LaunchpadService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  @Get('/:chain/common-collection-nft-fee')
  async getCreateCommonCollectionNftFee(
    @Param('chain') chain: string,
    @Query('userAddress') userAddress: string,
  ) {
    const { fee, feeAfterDiscount, discountPercentage } =
      await this.launchpadService.calculateMintFee(userAddress);
    return { fee, feeAfterDiscount, discountPercentage };
  }

  @Post('/:chain/create-common-collection-nft')
  async createCommonCollectionNft(
    @Param('chain') chain: string,
    @Body()
    body: {
      userAddress: string;
      nft: {
        name: string;
        image: string;
        description: string;
        knowledge: string[];
        personality?: string[];
        greeting?: string;
        lore?: string[];
        style?: string[];
        adjectives?: string[];
      };
      createToken?: {
        tokenInfo: {
          name: string;
          symbol: string;
          file: string; // image, base64 encoded blob
          description: string;
          twitter?: string;
          telegram?: string;
          website?: string;
        };
        buyAmountSol: number;
      };
    },
  ) {
    return this.launchpadService.createCommonCollectionNft({
      chain,
      userAddress: body.userAddress,
      nft: body.nft,
      createToken: body.createToken,
    });
  }

  @Post('create-w3s-delegate')
  async createWeb3StorageDelegate(@Body() { did }: { did: string }) {
    const delegation =
      await this.launchpadService.createWeb3StorageDelegation(did);
    return delegation;
  }

  @Get('agent-created-tokens')
  async getAgentCreatedTokens(
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('creatorAddress') creatorAddress?: string,
  ) {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.config.get('AI_AGENT_COIN_SERVICE_ENDPOINT')}/ai-agent-coin/coins`,
        {
          params: {
            sortBy: sortBy as any,
            sortOrder: sortOrder as any,
            offset: Number(offset),
            limit: Number(limit),
            creatorAddress,
          },
        },
      ),
    );
    return response.data;
  }
}
