import { type IAgentRuntime, type Memory, elizaLogger } from '@elizaos/core';
import { getRuntimeKey } from '../providers/environment.js';
import Moralis from 'moralis';
import bitqueryService from './bitqueryService.js';

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
  usdPrice24hrPercenChange: string;
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
  if (!symbol) {
    return undefined;
  }
  chain = chain || getRuntimeKey(runtime, 'NFT_CHAIN');
  const portfolio = await getWalletPortfolioFromRuntime(runtime, address, chain);
  return portfolio?.items.find((item) => (item.symbol === symbol) || (item.symbol?.toLowerCase() === symbol.toLowerCase()));
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
    switch (chain) {
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
      if (item.tokenAddress && item.balance.value.toString() !== '0') {
        walletPortfolio.items.push({
          name: item.name,
          address: item.tokenAddress.lowercase,
          symbol: item.symbol,
          logoURI: item.logo,
          decimals: item.decimals,
          balance: item.balance.value.toString(),
          uiAmount: item.balanceFormatted,
          priceUsd: item.usdPrice,
          valueUsd: item.usdValue.toString(),
          usdPrice24hrPercenChange: item.usdPrice24hrPercentChange,
        });
        walletPortfolio.totalUsd += item.usdValue;
      }
    });
    walletPortfolio.nextCursor = response.response.cursor;
    const zeroPriceTokens = walletPortfolio.items.filter((item) => Number(item.priceUsd) === 0).map((item) => item.address);
    if (zeroPriceTokens.length > 0) {
      try {
        const queryResults = await bitqueryService.query(
          `
          query MyQuery($currencies: [String!]) {
            EVM(dataset: combined, network: ${chain}) {
              DEXTradeByTokens(
                where: {Trade: {Currency: {SmartContract: {in: $currencies}}}}
                orderBy: {descending: Block_Time}
                limitBy: { by: Trade_Currency_SmartContract, count: 1 }
              ){
                Trade{
                  PriceInUSD
                  Currency{
                    SmartContract
                  }
                }
              }
            }
          }
          `,
          JSON.stringify({
            currencies: zeroPriceTokens
          })
        );
        const priceMap = new Map(
          queryResults.data.EVM.DEXTradeByTokens.map((entry) => [
            entry.Trade.Currency.SmartContract.toLowerCase(),
            entry.Trade.PriceInUSD,
          ])
        );
        walletPortfolio.items.forEach((item) => {
          if (priceMap.has(item.address) && Number(item.priceUsd) === 0) {
            item.priceUsd = priceMap.get(item.address) as string;
            item.valueUsd = (Number(item.uiAmount) * Number(item.priceUsd)).toString();
            walletPortfolio.totalUsd += Number(item.valueUsd);
          }
        });
      } catch (e) { 
        elizaLogger.error(`Failed to refresh zero price token ${e}`);
      }
    }

    return walletPortfolio;
  } catch (e) {
    elizaLogger.error(`Failed to fetch wallet portfolio ${address} ${e}`);
    throw new Error(`Failed to fetch wallet portfolio`);
  }
}