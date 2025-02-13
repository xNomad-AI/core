import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { type Connection, PublicKey } from '@solana/web3.js';
import { elizaLogger } from '@elizaos/core';

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

async function getTokenBalance(
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

async function getTokenBalances(
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

export async function getTokensBySymbol(
  birdeypeApikey: string,
  keyword: string,
) {
  if (!keyword) {
    return [];
  }
  if (tokenSymbolMap[keyword]) {
    return [{ address: tokenSymbolMap[keyword] }];
  }
  try {
    const url = `https://public-api.birdeye.so/defi/v3/search?chain=solana&keyword=${keyword}&target=token&sort_by=volume_24h_usd&sort_type=desc&verify_token=true&offset=0&limit=20`;
    const headers = {
      'X-API-KEY': birdeypeApikey,
      accept: 'application/json',
    };
    const response = await fetch(url, { headers });
    const result = await response.json();
    return result?.data?.items?.result as { address: string }[];
  } catch (error) {
    elizaLogger.error(`Error getting token CA: ${error}`);
    return [];
  }
}

export { getTokenBalance, getTokenBalances };
