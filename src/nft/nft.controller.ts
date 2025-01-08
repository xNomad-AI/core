import { Controller, Param, Post } from '@nestjs/common';
import { NftService } from './nft.service.js';

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
}
