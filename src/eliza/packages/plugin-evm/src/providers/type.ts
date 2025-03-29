import { BigNumber } from 'bignumber.js';

export interface SwapTokenDto extends GetSwapCallDataDto, TradeSettingsDto {
  privateKey: string;
}

export interface TradeSettingsDto {
  gasMode?: 'LOW' | 'AVG' | 'HIGH' | 'CUSTOM';
  maxFeePerGas?: string | BigNumber; // Gwei
  maxPriorityFeePerGas?: string | BigNumber; // Gwei
  mode?: 'FAST' | 'ANTI_MEV';
  tip?: string | BigNumber; // Gwei, 1 = 0.000000000000000001 eth
  slippage: number; // 0.01 = 1%
}

export interface GetSwapCallDataDto {
  chainName: string;
  rpcUrl: string;
  inputTokenCA: string;
  outputTokenCA: string;
  amount: string | BigNumber;
  slippage: number; // 0.01 = 1%
  userWalletAddress: string;
  exactFees?: ExactFee[];
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

export const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user's response to the tx confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
Consider the latest messages from the conversation history above. Determine the user's response status regarding the confirmation.
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

Decision Criteria:
•"confirmed" → The user has explicitly confirmed the transfer using words like “yes”, “confirm”, “okay”, “sure”, etc.
•"rejected" → The user has responded with anything other than a confirmation.
•"pending" → The user has provided a complete transfer request, but User2 has not yet sent the confirmation prompt.

Additional Rules:
•If the user issues a new transfer instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•Analyze the last five messages to understand the user’s intent in context.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Transfer 0.0001 SOL to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Transfer 1 ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

❓ **Should return \`"pending"\`**  
- User1: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7"  

- User1: "withdraw"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;


export interface OpenoceanParams {
  chainId: string;
  inTokenAddress: string;
  outTokenAddress: string;
  amount: string;
  gasPrice?: string;
  slippage: string;
  account: string;
  referrer?: string;
  referrerFee?: number;
}

export interface OpenoceanGasPriceResponse {
  code: number;
  data: {
    standard: number;
    fast: number;
    instant: number;
  };
  without_decimals: {
    standard: number;
    fast: number;
    instant: number;
  };
}

export interface OpenoceanTokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  usd: string;
  volume: number;
}

export interface OpenoceanSwapData {
  inToken: OpenoceanTokenInfo;
  outToken: OpenoceanTokenInfo;
  inAmount: string;
  outAmount: string;
  estimatedGas: number;
  minOutAmount: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  data: string;
}

export interface OpenoceanSwapResponse {
  code: number;
  data?: OpenoceanSwapData;
}


export interface OpenoceanQuoteParams {
  chainId: string;
  gasPrice: string;
  inTokenAddress: string;
  outTokenAddress: string;
  amount: string;
  enabledDexIds?: string;
}

export interface OpenoceanQuoteResponse {
  code: number;
  data: QuoteData;
}

interface QuoteData {
  inToken: TokenInfo;
  outToken: TokenInfo;
  inAmount: string;
  outAmount: string;
  estimatedGas: string;
  path: SwapPath;
  save: number;
  price_impact: string;
}

interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  usd: string;
  volume: number;
}

interface SwapPath {
  from: string;
  to: string;
  parts: number;
  routes: Route[];
}

interface Route {
  parts: number;
  percentage: number;
  subRoutes: SubRoute[];
}

interface SubRoute {
  from: string;
  to: string;
  parts: number;
  dexes: Dex[];
}

interface Dex {
  dex: string;
  id: string;
  parts: number;
  percentage: number;
}


export interface KyberSwapParams {
  chain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  to: string;
  slippageTolerance: string;
  isInBps?: boolean;
  chargeFeeBy?: 'currency_in' | 'currency_out';
  feeReceiver?: string;
  feeAmount?: string;
}

export interface KyberSwapResponse {
  inputAmount: string;
  outputAmount: string;
  totalGas: number;
  gasPriceGwei: string;
  gasUsd: number;
  amountInUsd: number;
  amountOutUsd: number;
  receivedUsd: number;
  encodedSwapData: string;
  routerAddress: string;
}

export interface FourMemeTokenInfo {
  version: string;
  tokenManager: string;
  quote: string;
  lastPrice: string;
  tradingFeeRate: string;
  minTradingFee: string;
  launchTime: string;
  offers: string;
  maxOffers: string;
  funds: string;
  maxFunds: string;
  liquidityAdded: boolean;
}

export interface FourMemeTryBuy {
  tokenManager: string;
  quote: string;
  estimatedAmount: string;
  estimatedCost: string;
  estimatedFee: string;
  amountMsgValue: string;
  amountApproval: string;
  amountFunds: string;
}

export interface FourMemeTrySell {
  tokenManager: string;
  quote: string;
  funds: string;
  fee: string;
}

export interface FourMemeSwapParams {
  rpcUrl: string;
  chainName: string;
  inputTokenCA: string;
  outputTokenCA: string;
  amount: string;
  recipient: string;
  slippage: number;
  exactFees: ExactFee[];
}

export interface FourMemeSwapResponse {
  to: string;
  data: string;
  value: string;
}

export interface SwapxGetPoolParams {
  rpcUrl: string;
  chainName: string;
  token: string;
  fee: number;
}

export interface ExactFee {
  feeCollector: string;
  feeRate: string;
}

export interface SwapxSwapV3ExactInParams {
  chainName: string;
  factoryAddress: string;
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  fee: number;
  recipient: string;
  deadline: string;
  amountIn: string;
  amountOutMinimum: string;
  sqrtPriceLimitX96: number;
  exactFees: ExactFee[];
}

export interface SwapV3MultiHopExactInParams {
  chainName: string;
  factoryAddresses: string[];
  poolAddresses: string[];
  path: string;
  recipient: string;
  deadline: string;
  amountIn: string;
  amountOutMinimum: string;
  exactFees: ExactFee[];
}

export interface SwapxParams {
  chainName: string;
  chainId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  deciaml: number;
  to: string;
  slippage: number; // min 0, max 1
  exactFees: ExactFee[];
  gasPrice?: string;
}