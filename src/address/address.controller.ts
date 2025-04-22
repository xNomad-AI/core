import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AddressService } from './address.service.js';
import { NonceType } from '../shared/mongo/types.js';
import { AuthService } from '../shared/auth/auth.service.js';
import { normalizeBlockchainAddress } from '../nft/nft.types.js';
import { SwapTokenService, GetSwapCallDataDto } from '@elizaos/plugin-evm';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
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
  async login(@Body() { chain, address, signature }) {
    // Verify signature
    const { accessToken } = this.authService.getAccessToken({ chain, address });
    return { accessToken };
  }

  // This is used to configure the session for the user,
  // it will add the userId, roomId, and agentId to this New JWT token
  @Post('/session/configure')
  @UseGuards(AuthGuard)
  async configureSession(
    @Request() req,
    @Body() { userId, roomId, agentId }
  ) {
    const newPayload = { 
      chain: req['X-USER-CHAIN'], 
      address: req['X-USER-ADDRESS'],
      userId, roomId, agentId 
    };
    const { accessToken } = this.authService.getAccessToken(newPayload);
    return { accessToken };
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

