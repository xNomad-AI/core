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
  const teeMode = runtime.getSetting('TEE_MODE') as TEEMode || TEEMode.OFF;
  const walletSecretSalt = runtime.getSetting('WALLET_SECRET_SALT');
  const agentId = runtime.agentId;
  const endpoint = runtime.getSetting('WALLET_SERVICE_ENDPOINT');
  const walletServiceSecretToken = runtime.getSetting('WALLET_SERVICE_SECRET_TOKEN');
  return await getWalletKeyFromWalletService({
    teeMode,
    walletSecretSalt,
    agentId,
    requirePrivateKey,
    endpoint,
    walletServiceSecretToken,
  });
}

export async function getWalletKeyFromWalletService({
  teeMode,
  walletSecretSalt,
  agentId,
  requirePrivateKey,
  endpoint,
  walletServiceSecretToken }: {
 teeMode: TEEMode,
  walletSecretSalt: string,
  agentId: string,
  requirePrivateKey: boolean,
  endpoint: string,
  walletServiceSecretToken: string}): Promise<KeypairResult>  {
  if (teeMode === TEEMode.OFF) {
    throw new Error('TEE_MODE must be enabled to use this function');
  }
  if (!walletSecretSalt) {
    throw new Error('WALLET_SECRET_SALT required when TEE_MODE is enabled');
  }

  let deriveKeyResult: { keypair: Keypair };

  if (endpoint) {
    endpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    deriveKeyResult = await axios
      .post(
        `${endpoint}/wallet/wallet`,
        {
          walletSecretSalt,
          agentId,
          teeMode,
          requirePrivateKey: true,
        },
        {
          headers: {
            'x-secret-token': walletServiceSecretToken,
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
      agentId,
    );
  }
  elizaLogger.info(`get tee address, ${deriveKeyResult.keypair.publicKey}`);
  return requirePrivateKey
    ? { keypair: deriveKeyResult.keypair }
    : { publicKey: deriveKeyResult.keypair.publicKey };
}

export function sign(message: string, keypair: Keypair): string {
  const keyPair = nacl.sign.keyPair.fromSecretKey(keypair.secretKey);
  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    keyPair.secretKey,
  );
  return bs58.encode(signature);
}
