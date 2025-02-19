import { TEEMode } from '@elizaos/plugin-tee';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { firstValueFrom } from 'rxjs';

interface KeypairResult {
  keypair?: Keypair;
  publicKey?: PublicKey;
  evmAddress: string;
}

@Injectable()
export class WalletProxyService {
  private endpoint: string;
  private secretToken: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.config.get('WALLET_SERVICE_ENDPOINT')!;
    this.secretToken = this.config.get('WALLET_SERVICE_SECRET_TOKEN')!;
  }

  async getWalletKey(
    walletSecretSalt: string,
    agentId: string,
    teeMode: TEEMode,
    requirePrivateKey = true,
  ): Promise<KeypairResult> {
    let endpoint = this.endpoint;
    if (endpoint.endsWith('/')) {
      endpoint = endpoint.slice(0, -1);
    }
    return firstValueFrom(
      this.httpService.post(
        `${endpoint}/wallet/wallet`,
        {
          walletSecretSalt,
          agentId,
          teeMode,
          requirePrivateKey,
        },
        {
          headers: {
            'x-secret-token': this.secretToken,
            'Content-Type': 'application/json',
          },
        },
      ),
    ).then((response) => {
      return {
        keypair:
          response.data.secretKey &&
          Keypair.fromSecretKey(bs58.decode(response.data.secretKey)),
        publicKey: new PublicKey(response.data.publicKey),
        evmAddress: response.data.evmAddress as string,
      };
    });
  }
}
