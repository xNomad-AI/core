import {
  getOrCreateAssociatedTokenAccount, NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  type Keypair, LAMPORTS_PER_SOL,
  PublicKey,
  type RpcResponseAndContext, SignatureStatus,
  VersionedTransaction,
} from '@solana/web3.js';
import { settings, elizaLogger, IAgentRuntime } from '@elizaos/core';

import { createHash } from 'crypto';
import { BigNumber } from 'bignumber.js';
import { sleep, SolanaClient } from './solanaClient.js';

export async function getTokenDecimals(
  connection: Connection,
  mintAddress: string,
): Promise<number> {
  const mintPublicKey = new PublicKey(mintAddress);
  const tokenAccountInfo = await connection.getParsedAccountInfo(mintPublicKey);

  // Check if the data is parsed and contains the expected structure
  if (
    tokenAccountInfo.value &&
    typeof tokenAccountInfo.value.data === 'object' &&
    'parsed' in tokenAccountInfo.value.data
  ) {
    const parsedInfo = tokenAccountInfo.value.data.parsed?.info;
    if (parsedInfo && typeof parsedInfo.decimals === 'number') {
      return parsedInfo.decimals;
    }
  }

  throw new Error('Unable to fetch token decimals');
}

export function md5sum(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

// convert null strings to null
export function convertNullStrings(obj) {
  for (const key in obj) {
    if (obj[key] === 'null') {
      obj[key] = null;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertNullStrings(obj[key]);
    }
  }
  return obj;
}

const DEFAULT_CONFIG = {
  JUP_SWAP_FEE_ACCOUNT: '5o5pzvdWLieWQ5JumkbsSgDn7ME69ewnx76VUnb4x3sd',
  JUP_SWAP_FEE_BPS: 100,
};

export function getSWAP_FEE_BPS() {
  return settings.JUP_SWAP_FEE_BPS || DEFAULT_CONFIG.JUP_SWAP_FEE_BPS;
}

export function getSWAP_FEE_ACCOUNT() {
  const ret =
    settings.JUP_SWAP_FEE_ACCOUNT || DEFAULT_CONFIG.JUP_SWAP_FEE_ACCOUNT;
  return ret;
}

export async function getTradeSettings(agentId: string) {
  const result = await fetch(`http://localhost:8080/agent/trade/settings?agentId=${agentId}`);
  return await result.json() as {priorityFee, tip, slippage, mode};
}
