import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { BigNumber } from 'bignumber.js';

export type SwapTransaction = VersionedTransaction | Transaction;

export interface SwapTokenDto {
  connection: Connection;
  keyPair: Keypair;
  userWalletAddress: string;
  inputTokenCA: string;
  outputTokenCA: string;
  amount: string | BigNumber;
  slippage: number; // 0.01 = 1%
  priorityFee: number;
  tip?: number; // default 0.001 SOL
  mode?: 'FAST' | 'ANTI_MEV';
}

export interface JitoResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
}

export interface OkxSwapResponse {
  data: {
    data: Array<{
      tx: {
        data: string;
      };
    }>;
    msg?: string;
  };
}

export interface OkxParams {
  amount: string;
  slippage: string;
  chainId: string;
  userWalletAddress: string;
  computeUnitPrice: string;
  computeUnitLimit: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  feePercent?: string; // 0~3
  fromTokenReferrerWalletAddress?: string; // buy
  toTokenReferrerWalletAddress?: string; // sell
}
