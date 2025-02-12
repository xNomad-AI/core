import { elizaLogger, IAgentRuntime } from '@elizaos/core';
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

  async getWallet(
    runtime: IAgentRuntime,
    requirePrivateKey = true,
  ): Promise<KeypairResult> {
    const teeMode = runtime.getSetting('TEE_MODE') || TEEMode.OFF;

    if (teeMode !== TEEMode.OFF) {
      const walletSecretSalt = runtime.getSetting('WALLET_SECRET_SALT');
      elizaLogger.info(
        `failed to get WALLET_SECRET_SALT , ${JSON.stringify(runtime.character.settings.secrets)}`,
      );
      if (!walletSecretSalt) {
        throw new Error('WALLET_SECRET_SALT required when TEE_MODE is enabled');
      }

      if (this.endpoint.endsWith('/')) {
        this.endpoint = this.endpoint.slice(0, -1);
      }

      const result = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/wallet/wallet`,
          {
            walletSecretSalt,
            agentId: runtime.agentId,
            teeMode,
            requirePrivateKey,
          },
          {
            headers: {
              'x-secret-token': this.secretToken,
            },
          },
        ),
      ).then((response) => {
        return {
          keypair: Keypair.fromSecretKey(bs58.decode(response.data.secretKey)),
          publicKey: new PublicKey(response.data.publicKey),
        };
      });

      elizaLogger.info(`get tee address, ${result.keypair.publicKey}`);

      return requirePrivateKey
        ? { keypair: result.keypair }
        : { publicKey: result.keypair.publicKey };
    }

    // TEE mode is OFF
    if (requirePrivateKey) {
      const privateKeyString =
        runtime.getSetting('SOLANA_PRIVATE_KEY') ??
        runtime.getSetting('WALLET_PRIVATE_KEY');

      if (!privateKeyString) {
        throw new Error('Private key not found in settings');
      }

      try {
        // First try base58
        const secretKey = bs58.decode(privateKeyString);
        return { keypair: Keypair.fromSecretKey(secretKey) };
      } catch (e) {
        elizaLogger.log('Error decoding base58 private key:', e);
        try {
          // Then try base64
          elizaLogger.log('Try decoding base64 instead');
          const secretKey = Uint8Array.from(
            Buffer.from(privateKeyString, 'base64'),
          );
          return { keypair: Keypair.fromSecretKey(secretKey) };
        } catch (e2) {
          elizaLogger.error('Error decoding private key: ', e2);
          throw new Error('Invalid private key format');
        }
      }
    } else {
      const publicKeyString =
        runtime.getSetting('SOLANA_PUBLIC_KEY') ??
        runtime.getSetting('WALLET_PUBLIC_KEY');

      if (!publicKeyString) {
        throw new Error('Public key not found in settings');
      }

      return { publicKey: new PublicKey(publicKeyString) };
    }
  }
}
