import { Body, Controller, Param, Post } from '@nestjs/common';
import { LaunchpadService } from './launchpad.service.js';

@Controller('/launchpad')
export class LaunchpadController {
  constructor(private readonly launchpadService: LaunchpadService) {}

  @Post('/:chain/create-common-collection-nft')
  createCommonCollectionNft(
    @Param('chain') chain: string,
    @Body()
    body: {
      userAddress: string;
      nft: {
        name: string;
        image: string;
        description: string[];
        knowledge: string[];
        personality?: string[];
        greeting?: string;
        lore?: string[];
        style?: string[];
        adjectives?: string[];
      };
    },
  ) {
    return this.launchpadService.createCommonCollectionNft(
      body.userAddress,
      body.nft,
    );
  }

  @Post('create-w3s-delegate')
  async createWeb3StorageDelegate(@Body() { did }: { did: string }) {
    const delegation =
      await this.launchpadService.createWeb3StorageDelegation(did);
    return delegation;
  }
}
