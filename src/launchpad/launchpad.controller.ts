import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TradeMonitorService } from '../shared/trade-monitor.service.js';
import { LaunchpadService } from './launchpad.service.js';

@Controller('/launchpad')
export class LaunchpadController {
  constructor(
    private readonly launchpadService: LaunchpadService,
    private readonly tradeMonitorService: TradeMonitorService,
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
    return this.tradeMonitorService.getAgentCreatedTokens({
      sortBy,
      sortOrder,
      offset,
      limit,
      creatorAddress,
    });
  }
}
