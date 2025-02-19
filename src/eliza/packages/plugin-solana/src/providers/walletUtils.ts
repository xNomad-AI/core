import { type IAgentRuntime, type Memory, elizaLogger } from '@elizaos/core';

import { getRuntimeKey } from '../environment.js';

class BirdEyeAPIResponse<T> {
  success: boolean;
  data: T;
}

export class WalletPortfolio {
  items: Item[];
  totalUsd: number;
}

export interface Item {
  name: string;
  address: string;
  symbol?: string;
  decimals: number;
  balance: string;
  uiAmount: string;
  priceUsd: string;
  valueUsd: string;
  valueSol?: string;
}

export const NotAgentAdminMessage =
  'Access denied: Only the Agent Owner has permission to perform this action. Please sign in with the correct account.';

export async function isAgentAdmin(runtime: IAgentRuntime, message: Memory) {
  if (process.env?.DISABLE_ADMIN_CHECK == 'true') {
    elizaLogger.warn('Admin check is disabled');
    return true;
  }
  const accessToken = message.content.accessToken;
  if (!accessToken) {
    elizaLogger.log('Admin check returned false, no token provided');
    return false;
  }
  try {
    const response = await fetch(
      `http://localhost:8080/nft/agent/auth?agentId=${runtime.agentId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (response.status !== 200) {
      return false;
    }
    const data = (await response.json()) as { isAdmin: boolean };
    return data?.isAdmin;
  } catch (error) {
    elizaLogger.error('Admin check failed', error);
    return false;
  }
}

export async function getWalletTokenBySymbol(
  runtime: IAgentRuntime,
  address: string,
  symbol: string,
): Promise<Item> {
  const portfolio = await getWalletPortfolio(runtime, address);
  const token = portfolio?.items.find((item) => item.symbol === symbol);
  return token;
}

export async function getWalletPortfolio(
  runtime: IAgentRuntime,
  address: string,
): Promise<WalletPortfolio | undefined> {
  try {
    const birdeyeApikey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
    const response = await fetch(
      `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${address}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': birdeyeApikey,
          'x-chain': 'solana',
        },
      },
    );
    if (response.status !== 200) {
      elizaLogger.error(
        `Failed to fetch wallet portfolio ${address} ${response.status}`,
      );
      return undefined;
    }
    const data = await response.json();
    const birdEyeResponse = data as BirdEyeAPIResponse<WalletPortfolio>;
    if (birdEyeResponse.success) {
      return birdEyeResponse.data;
    }
  } catch (e) {
    elizaLogger.error(`Failed to fetch wallet portfolio ${address} ${e}`);
  }
  return undefined;
}
