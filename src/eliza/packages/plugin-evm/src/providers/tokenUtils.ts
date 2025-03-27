import { elizaLogger, IAgentRuntime } from '@elizaos/core';
import { getRuntimeKey } from './environment.js';


export async function getTokenCABySymbol(
  runtime: IAgentRuntime,
  chain: string,
  keyword: string,
): Promise<string | undefined> {
  let tokens = await getTokensBySymbol(runtime, chain, keyword);
  if (tokens?.[0]?.address) {
    return tokens[0]?.address;
  }
  if (keyword?.startsWith('$')) {
    tokens = await getTokensBySymbol(runtime, chain, keyword.slice(1));
  }
  return tokens?.[0]?.address;
}

export async function getTokenSymbolByCA(
  runtime: IAgentRuntime,
  chain: string,
  tokenCA: string,
) {
  const birdeypeApikey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
  const url = `https://public-api.birdeye.so/defi/v3/token?address=${tokenCA}`;
  const response = await fetch(url, {
    headers: {
      'X-API-KEY': birdeypeApikey,
      accept: 'application/json',
    },
  });
  const result = await response.json();
  return result?.data?.items?.[0]?.result?.symbol;
}

export async function getTokensBySymbol(
  runtime: IAgentRuntime,
  chain: string,
  keyword: string,
) {
  const birdeypeApikey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
  if (!keyword) {
    return [];
  }
  try {
    const url = `https://public-api.birdeye.so/defi/v3/search?chain=${chain}&keyword=${keyword}&target=token&sort_by=volume_24h_usd&sort_type=desc&verify_token=true&offset=0&limit=10`;
    const headers = {
      'X-API-KEY': birdeypeApikey,
      accept: 'application/json',
    };
    const response = await fetch(url, { headers });
    const result = await response.json();
    return result?.data?.items?.[0]?.result as {
      name: string;
      symbol: string;
      address: string;
      decimals: string | number;
    }[];
  } catch (error) {
    elizaLogger.error(`Error getting token CA: ${error}`);
    return [];
  }
}

// // validate evm token address format
export function isValidAddress(address: string) {
  try {
    if (!address) return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  } catch (error) {
    return false;
  }
}


// validate evm token address format
export function validateAndAssignCA(tokenSymbol: string, tokenCA: string) {
  if (isValidAddress(tokenCA)) {
    return tokenCA;
  }
  if (isValidAddress(tokenSymbol)) {
    return tokenSymbol;
  }
  return null;
}

export async function getSwapTokenPrice(
  runtime: IAgentRuntime,
  chain: string,
  tokenCA: string,
): Promise<number | undefined> {
  try {
    const birdeyeApiKey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
    const url = `https://public-api.birdeye.so/defi/price?address=${tokenCA}`;
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': birdeyeApiKey,
        accept: 'application/json',
        'x-chain': chain,
      },
    });
    const result = await response.json();
    return result?.data.value;
  } catch (error) {
    elizaLogger.error(`Error fetching token price: ${error}`);
    return undefined;
  }
}

export function trimTokenSymbol(tokenSymbol: string) {
  if (tokenSymbol?.startsWith('$$')) {
    return tokenSymbol.slice(1);
  }
  return tokenSymbol;
}