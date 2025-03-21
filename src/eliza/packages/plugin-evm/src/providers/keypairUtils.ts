import { type IAgentRuntime, elizaLogger } from '@elizaos/core';
import { DeriveKeyProvider, TEEMode } from '@elizaos/plugin-tee';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, Hex, http } from 'viem';

export interface EvmAccount {
  address: string;
  privateKey: string;
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
): Promise<EvmAccount> {
  const teeMode = (runtime.getSetting('TEE_MODE') as TEEMode) || TEEMode.OFF;
  const walletSecretSalt = runtime.getSetting('WALLET_SECRET_SALT');
  const agentId = runtime.agentId;
  const endpoint = runtime.getSetting('WALLET_SERVICE_ENDPOINT');
  const walletServiceSecretToken = runtime.getSetting(
    'WALLET_SERVICE_SECRET_TOKEN',
  );
  return await getAccountFromWalletService({
    teeMode,
    walletSecretSalt,
    agentId,
    requirePrivateKey,
    endpoint,
    walletServiceSecretToken,
  });
}

export async function getAccountFromWalletService({
  teeMode,
  walletSecretSalt,
  agentId,
  requirePrivateKey,
  endpoint,
  walletServiceSecretToken,
}: {
  teeMode: TEEMode;
  walletSecretSalt: string;
  agentId: string;
  requirePrivateKey: boolean;
  endpoint: string;
  walletServiceSecretToken: string;
}): Promise<EvmAccount> {
  if (teeMode === TEEMode.OFF) {
    throw new Error('TEE_MODE must be enabled to use this function');
  }
  if (!walletSecretSalt) {
    throw new Error('WALLET_SECRET_SALT required when TEE_MODE is enabled');
  }

  let account: EvmAccount;

  if (endpoint) {
    endpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    account = await fetch(`${endpoint}/wallet/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-token': walletServiceSecretToken,
      },
      body: JSON.stringify({
        walletSecretSalt,
        agentId,
        teeMode,
        requirePrivateKey: true,
      }),
    })
      .then((response) => response.json())  // Parse the response as JSON
      .then((data) => {
        return {
          address: data.evmAddress,
          privateKey: data.evmPrivateKey,
        };
      });
  } else {
    const deriveKeyProvider = new DeriveKeyProvider(teeMode);
    const deriveKeyResult = await deriveKeyProvider.deriveEcdsaKeypair(
      walletSecretSalt,
      'evm',
      agentId,
    );
    account = {
      address: deriveKeyResult.keypair.address,
      privateKey: deriveKeyResult.keypair.sign as unknown as string,
    }
  }
  elizaLogger.info(`get tee address, ${account.address}`);
  return requirePrivateKey
    ? { address: account.address, privateKey: undefined }
    : { address: account.address, privateKey: account.privateKey };
}

export async function signMessage(message: string, privateKey: string, rpcUrl: string): Promise<string> {
  try {
    const account = privateKeyToAccount(privateKey as Hex);
    const walletClient = createWalletClient({
      chain: this.chain,
      transport: http(rpcUrl),
      account,
    });
    const signature = await walletClient.signMessage({
      message,
      account,
    });
    return signature.toString();
  } catch (error) {
    console.error("Signing error:", error);
    throw new Error("Failed to sign message");
  }
}