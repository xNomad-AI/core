import { PublicClient } from "viem";
import { BigNumber } from 'bignumber.js';

export interface SwapTokenDto {
  rpcUrl: string;
  chainId: string;
  chainName: string;
  inputTokenCA: string;
  outputTokenCA: string;
  amount: string | BigNumber;
  slippage: number; // 0.01 = 1%
  maxFee: string | BigNumber;
  mode?: 'FAST' | 'ANTI_MEV';
  privateKey: string;
  userWalletAddress: string;
}

export interface TransactionDto {
  form: string;
  to: string;
  data: string;
  value: string | BigNumber;
}

interface DexProtocol {
  dexName: string;
  percent: string;
}

interface Token {
  decimal: string;
  isHoneyPot: boolean;
  taxRate: string;
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenUnitPrice: string;
}

interface SubRouter {
  dexProtocol: DexProtocol[];
  fromToken: Token;
  toToken: Token;
}

interface DexRouter {
  router: string;
  routerPercent: string;
  subRouterList: SubRouter[];
}

interface QuoteCompare {
  amountOut: string;
  dexLogo: string;
  dexName: string;
  tradeFee: string;
}

interface RouterResult {
  chainId: string;
  dexRouterList: DexRouter[];
  estimateGasFee: string;
  fromToken: Token;
  fromTokenAmount: string;
  priceImpactPercentage: string;
  quoteCompareList: QuoteCompare[];
  toToken: Token;
  toTokenAmount: string;
  tradeFee: string;
}

interface Tx {
  data: string;
  from: string;
  gas: string;
  gasPrice: string;
  maxPriorityFeePerGas: string;
  minReceiveAmount: string;
  signatureData: string[];
  to: string;
  value: string;
}

interface DataItem {
  routerResult: RouterResult;
  tx: Tx;
}

export interface OkxSwapResponse {
  code: string;
  data: DataItem[];
  msg: string;
}

export interface TransactionData {
  data: string;
  from: string;
  gas: string;
  gasPrice: string;
}

export interface OkxParams {
  chainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  slippage: string;
  userWalletAddress: string;
  feePercent?: string; // 0~3
  fromTokenReferrerWalletAddress?: string; // buy
  toTokenReferrerWalletAddress?: string; // sell
  directRoute?: boolean;
  autoSlippage?: boolean;
  maxAutoSlippage?: string;
}