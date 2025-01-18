import { Controller, Get, Query } from '@nestjs/common';
import { AddressService } from './address.service.js';
import { NonceType } from '../shared/mongo/types.js';

@Controller('/address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get('/nonce')
  async getNonce(
    @Query('chain') chain: string,
    @Query('address') address: string,
    @Query('type') nonceType: NonceType,
  ) {
    const message = await this.addressService.getNonce(
      chain,
      address,
      nonceType,
    );
    return {
      message,
    };
  }
}
