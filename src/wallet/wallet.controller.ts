import { TEEMode } from '@elizaos/plugin-tee';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import bs58 from 'bs58';
import { AuthGuard } from './auth.guard.js';
import { WalletService } from './wallet.service.js';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @UseGuards(AuthGuard)
  @Post('wallet')
  async getWallet(
    @Body()
    {
      walletSecretSalt,
      agentId,
      teeMode,
      requirePrivateKey,
    }: {
      walletSecretSalt: string;
      agentId: string;
      teeMode: TEEMode;
      requirePrivateKey: boolean;
    },
  ) {
    const { secretKey, publicKey } = await this.walletService.getWallet({
      walletSecretSalt,
      agentId,
      teeMode,
    });
    return {
      ...(requirePrivateKey ? { secretKey: bs58.encode(secretKey) } : {}),
      publicKey: publicKey.toBase58(),
    };
  }

  @UseGuards(AuthGuard)
  @Post('sign-transaction')
  async signTransaction(
    @Body()
    {
      walletSecretSalt,
      agentId,
      teeMode,
      inputTransaction,
    }: {
      walletSecretSalt: string;
      agentId: string;
      teeMode: TEEMode;
      inputTransaction: string;
    },
  ) {
    return this.walletService.signSolanaTransaction({
      walletSecretSalt,
      agentId,
      teeMode,
      inputTransaction,
    });
  }
}
