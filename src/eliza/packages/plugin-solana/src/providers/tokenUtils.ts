import {
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { type Connection, PublicKey } from '@solana/web3.js';
import { elizaLogger, IAgentRuntime } from '@elizaos/core';
import { getRuntimeKey } from '../environment.js';

const tokenNameMap: { [mintAddress: string]: string } = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  So11111111111111111111111111111111111111112: 'SOL',
  HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC: 'ai16z',
  '5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM': 'ELIZA',
  // Add more token mint addresses and their corresponding names
};

const tokenSymbolMap: { [symbol: string]: string } = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SOL: 'So11111111111111111111111111111111111111112',
  ai16z: 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC',
  ELIZA: '5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM',
};

export async function getTokenPriceInSol(tokenSymbol: string): Promise<number> {
  const response = await fetch(
    `https://price.jup.ag/v6/price?ids=${tokenSymbol}`,
  );
  const data = await response.json();
  return data.data[tokenSymbol].price;
}

export async function getTokenBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  tokenMintAddress: PublicKey,
): Promise<number> {
  const tokenAccountAddress = await getAssociatedTokenAddress(
    tokenMintAddress,
    walletPublicKey,
  );

  try {
    const tokenAccount = await getAccount(connection, tokenAccountAddress);
    const tokenAmount = tokenAccount.amount as unknown as number;
    return tokenAmount;
  } catch (error) {
    elizaLogger.error(
      `Error retrieving balance for token: ${tokenMintAddress.toBase58()}`,
      error,
    );
    return 0;
  }
}

export async function getTokenBalances(
  connection: Connection,
  walletPublicKey: PublicKey,
): Promise<{ [tokenName: string]: number }> {
  const tokenBalances: { [tokenName: string]: number } = {};

  // Add the token mint addresses you want to retrieve balances for
  const tokenMintAddresses = [
    new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
    new PublicKey('So11111111111111111111111111111111111111112'), // SOL
    // Add more token mint addresses as needed
  ];

  for (const mintAddress of tokenMintAddresses) {
    const tokenName = getTokenName(mintAddress);
    const balance = await getTokenBalance(
      connection,
      walletPublicKey,
      mintAddress,
    );
    tokenBalances[tokenName] = balance;
  }

  return tokenBalances;
}

function getTokenName(mintAddress: PublicKey): string {
  // Implement a mapping of mint addresses to token names
  return tokenNameMap[mintAddress.toBase58()] || 'Unknown Token';
}

export async function getTokenCABySymbol(
  runtime: IAgentRuntime,
  keyword: string,
): Promise<string | undefined> {
  let tokens = await getTokensBySymbol(runtime, keyword);
  if (tokens?.[0]?.address) {
    return tokens[0]?.address;
  }
  if (keyword.startsWith('$')) {
    tokens = await getTokensBySymbol(runtime, keyword.slice(1));
  }
  return tokens?.[0]?.address;
}

export async function getTokensBySymbol(
  runtime: IAgentRuntime,
  keyword: string,
) {
  const birdeypeApikey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
  if (!keyword) {
    return [];
  }
  if (tokenSymbolMap[keyword]) {
    return [{ address: tokenSymbolMap[keyword] }];
  }
  try {
    const url = `https://public-api.birdeye.so/defi/v3/search?chain=solana&keyword=${keyword}&target=token&sort_by=volume_24h_usd&sort_type=desc&verify_token=true&offset=0&limit=10`;
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

export function isValidAddress(address: string) {
  try {
    const publicKey = new PublicKey(address);
    return publicKey.toBase58().length === 44;
  } catch (error) {
    return false;
  }
}

export function isValidSPLTokenAddress(address: string) {
  try {
    const publicKey = new PublicKey(address);
    // Check if the public key is associated with an existing token program
    return (
      publicKey &&
      publicKey.toBase58().length >= 43 &&
      publicKey.toBase58().length < 45
    );
    // SPL TOKEN=44
    // WSOL=43
  } catch (error) {
    return false; // Not a valid public key
  }
}

// tokenSymbol maybe mismatched with tokenCA, so we need to validate and assign the correct one
export function validateAndAssignCA(tokenSymbol: string, tokenCA: string) {
  const isValidSymbol = isValidSPLTokenAddress(tokenSymbol);
  const isValidCA = isValidSPLTokenAddress(tokenCA);

  if (isValidSymbol && !isValidCA) {
    return tokenSymbol;
  }
  if (isValidCA) {
    return tokenCA;
  }
  return null;
}

export async function getSwapTokenPrice(
  runtime: IAgentRuntime,
  tokenCA,
): Promise<number | undefined> {
  try {
    const birdeyeApiKey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
    const url = `https://public-api.birdeye.so/defi/price?address=${tokenCA}`;
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': birdeyeApiKey,
        accept: 'application/json',
        'x-chain': 'solana',
      },
    });
    const result = await response.json();
    return result?.data.value;
  } catch (error) {
    elizaLogger.error(`Error fetching token price: ${error}`);
    return undefined;
  }
}
