import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EvmLaunchpadService } from './evm/evm-launchpad.service.js';
import { LaunchpadService } from './launchpad.service.js';

@Controller('/launchpad')
export class LaunchpadController {
  constructor(
    private readonly launchpadService: LaunchpadService,
    private readonly evmLaunchpadService: EvmLaunchpadService,
  ) {}

  @Get('/:chain/common-collection-nft-fee')
  async getCreateCommonCollectionNftFee(
    @Param('chain') chain: string,
    @Query('userAddress') userAddress: string,
  ) {
    if (chain === 'solana') {
      const { fee, feeAfterDiscount, discountPercentage } =
        await this.launchpadService.calculateMintFee(userAddress);
      return { fee, feeAfterDiscount, discountPercentage };
    } else {
      const { fee, feeAfterDiscount, discountPercentage } =
        await this.evmLaunchpadService.calculateMintFee();
      return { fee, feeAfterDiscount, discountPercentage };
    }
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
          image: string;
          description: string;
          twitter?: string;
          telegram?: string;
          website?: string;
        };
        buyAmount: number;
      };
    },
  ) {
    if (body.createToken) {
      body.createToken.buyAmount =
        body.createToken.buyAmount ?? body.createToken['buyAmountSol'];
    }

    if (chain === 'solana') {
      return this.launchpadService.createCommonCollectionNft({
        chain,
        userAddress: body.userAddress,
        nft: body.nft,
        createToken: body.createToken,
      });
    } else {
      return this.evmLaunchpadService.createCommonCollectionNft({
        chain,
        userAddress: body.userAddress,
        nft: body.nft,
        createToken: body.createToken,
      });
    }
  }

  @Post('create-w3s-delegate')
  async createWeb3StorageDelegate(@Body() { did }: { did: string }) {
    const delegation =
      await this.launchpadService.createWeb3StorageDelegation(did);
    return delegation;
  }
}
