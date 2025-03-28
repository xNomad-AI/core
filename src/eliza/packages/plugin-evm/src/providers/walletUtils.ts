import { type IAgentRuntime, type Memory, elizaLogger } from '@elizaos/core';
import { getRuntimeKey } from '../providers/environment.js';
import Moralis from 'moralis';

let isMoralisInitialized = false;

export class WalletPortfolio {
  items: Item[];
  wallet: string;
  totalUsd: number;
  nextCursor?: string;
}

export interface Item {
  name: string;
  address: string;
  symbol?: string;
  logoURI?: string;
  decimals: number;
  balance: string;
  uiAmount: string;
  priceUsd: string;
  valueUsd: string;
}

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

export const NotAgentAdminResponse = {
  text: 'Access denied: Only the Agent Owner has permission to perform this action. Please sign in with the correct account.',
  isError: true,
};

export async function getWalletTokenBySymbol(
  runtime: IAgentRuntime,
  address: string,
  symbol: string,
  chain?: string,
): Promise<Item> {
  chain = chain || getRuntimeKey(runtime, 'NFT_CHAIN');
  const portfolio = await getWalletPortfolioFromRuntime(runtime, address, chain);
  return portfolio?.items.find((item) => item.symbol === symbol);
}

export async function getWalletPortfolioFromRuntime(
  runtime: IAgentRuntime,
  address: string,
  chain: string = 'bsc',
): Promise<WalletPortfolio> {
  const moralisApikey = getRuntimeKey(runtime, 'MORALIS_API_KEY');
  return await getWalletPortfolio(address, chain, { moralisApikey });
}

export async function getWalletPortfolio(
  address: string,
  chain: string = 'bsc',
  options?: {
    cursor?: string,
    moralisApikey?: string,
  },
): Promise<WalletPortfolio> {
  try {
    const { moralisApikey, cursor } = options || {};
    if (!isMoralisInitialized) {
      await Moralis.start({
        apiKey: moralisApikey
      });
      isMoralisInitialized = true;
    }
    let evmChain;
    switch(chain) {
      case 'bsc':
        evmChain = Moralis.EvmUtils.EvmChain.BSC;
        break;
      case 'eth':
        evmChain = Moralis.EvmUtils.EvmChain.ETHEREUM;
        break;
      case 'base':
        evmChain = Moralis.EvmUtils.EvmChain.BASE;
        break;
      default:
        throw new Error(`Unsupport chain: ${chain}`);
      }
    const response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
      chain: evmChain,
      address,
      excludeSpam: true,
      excludeUnverifiedContracts: false,
      limit: 100,
      cursor,
    });
    const walletPortfolio: WalletPortfolio = {
      items: [],
      wallet: address,
      totalUsd: 0
    };
    response.response.result.forEach((item) => {
      if (item.tokenAddress) {
        walletPortfolio.items.push({
          name: item.name,
          address: item.tokenAddress.lowercase,
          symbol: item.symbol,
          logoURI: item.logo,
          decimals: item.decimals,
          balance: item.balance.value.toString(),
          uiAmount: item.balanceFormatted,
          priceUsd: item.usdPrice,
          valueUsd: item.usdValue.toString()
        });
        walletPortfolio.totalUsd += item.usdValue;
      }
    });
    walletPortfolio.nextCursor = response.response.cursor;
    return walletPortfolio;
  } catch (e) {
    elizaLogger.error(`Failed to fetch wallet portfolio ${address} ${e}`);
    throw new Error(`Failed to fetch wallet portfolio`);
  }
}