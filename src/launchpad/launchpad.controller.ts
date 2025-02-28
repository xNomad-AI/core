import { Body, Controller, Param, Post } from '@nestjs/common';
import { LaunchpadService } from './launchpad.service.js';

@Controller('/launchpad')
export class LaunchpadController {
  constructor(private readonly launchpadService: LaunchpadService) {}

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
}
