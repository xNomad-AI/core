import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { AddressService } from './address.service.js';
import { NonceType } from '../shared/mongo/types.js';
import { AuthService } from '../shared/auth/auth.service.js';

@Controller('/address')
export class AddressController {
  constructor(
    private readonly addressService: AddressService,
    private readonly authService: AuthService,
  ) {}

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

  @Post('/login')
  async login(
    @Body()
    {
      chain,
      address,
      signature,
    }: {
      chain: string;
      address: string;
      signature: string;
    },
  ) {
    const isValid = await this.addressService.verifySignature(
      chain,
      address,
      'login',
      signature,
    );
    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }
    const { accessToken } = this.authService.getAccessToken({ chain, address });
    return {
      accessToken,
    };
  }
}
