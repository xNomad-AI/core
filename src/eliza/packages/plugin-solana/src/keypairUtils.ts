import { type IAgentRuntime, elizaLogger } from '@elizaos/core';
import { DeriveKeyProvider, TEEMode } from '@elizaos/plugin-tee';
import { Keypair, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

export interface KeypairResult {
  keypair?: Keypair;
  publicKey?: PublicKey;
}

/**
 * Gets either a keypair or public key based on TEE mode and runtime settings
 * @param runtime The agent runtime
 * @param requirePrivateKey Whether to return a full keypair (true) or just public key (false)
 * @returns KeypairResult containing either keypair or public key
 */
export async function getWalletKey(
  runtime: IAgentRuntime,
  requirePrivateKey = true,
): Promise<KeypairResult> {
  const teeMode = runtime.getSetting('TEE_MODE') || TEEMode.OFF;

  if (teeMode !== TEEMode.OFF) {
    const walletSecretSalt = runtime.getSetting('WALLET_SECRET_SALT');
    if (!walletSecretSalt) {
      elizaLogger.error(
        `failed to get WALLET_SECRET_SALT , ${JSON.stringify(runtime.character.settings.secrets)}`,
      );
      throw new Error('WALLET_SECRET_SALT required when TEE_MODE is enabled');
    }

    let deriveKeyResult: { keypair: Keypair };

    let endpoint = runtime.getSetting('WALLET_SERVICE_ENDPOINT');
    if (endpoint) {
      if (endpoint.endsWith('/')) {
        endpoint = endpoint.slice(0, -1);
      }
      deriveKeyResult = await axios
        .post(
          `${endpoint}/wallet/wallet`,
          {
            walletSecretSalt,
            agentId: runtime.agentId,
            teeMode,
            requirePrivateKey: true,
          },
          {
            headers: {
              'x-secret-token': runtime.getSetting(
                'WALLET_SERVICE_SECRET_TOKEN',
              ),
            },
          },
        )
        .then((response) => {
          return {
            keypair: Keypair.fromSecretKey(
              bs58.decode(response.data.secretKey),
            ),
            publicKey: new PublicKey(response.data.publicKey),
          };
        });
    } else {
      const deriveKeyProvider = new DeriveKeyProvider(teeMode);
      deriveKeyResult = await deriveKeyProvider.deriveEd25519Keypair(
        walletSecretSalt,
        'solana',
        runtime.agentId,
      );
    }

    elizaLogger.info(`get tee address, ${deriveKeyResult.keypair.publicKey}`);

    return requirePrivateKey
      ? { keypair: deriveKeyResult.keypair }
      : { publicKey: deriveKeyResult.keypair.publicKey };
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

export function sign(message: string, keypair: Keypair): string {
  const keyPair = nacl.sign.keyPair.fromSecretKey(keypair.secretKey);
  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    keyPair.secretKey,
  );
  return bs58.encode(signature);
}
