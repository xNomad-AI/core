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
import { normalizeBlockchainAddress } from '../nft/nft.types.js';
import { SwapTokenService, GetSwapCallDataDto } from '@elizaos/plugin-evm';
import { ConfigService } from '@nestjs/config';
@Controller('/address')
export class AddressController {
  constructor(
    private readonly addressService: AddressService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('/nonce')
  async getNonce(
    @Query('chain') chain: string,
    @Query('address') address: string,
    @Query('type') nonceType: NonceType,
  ) {
    address = normalizeBlockchainAddress(chain, address);
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
    address = normalizeBlockchainAddress(chain, address);
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

  @Post('/swap/calldata')
  async getSwapTxCallData(
    @Body() req: GetSwapCallDataDto) {
      const rpcUrl = this.configService.get(`${req.chainName.toUpperCase()}_RPC_URL`);
      const txReq = await new SwapTokenService().getSwapTxCallData({
        ...req,
        rpcUrl,
      });
      return txReq;
    }
}
