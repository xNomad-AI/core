import { Character } from '@elizaos/core';
import { COLLECTIONS } from './configs.js';
export type CollectionName = (typeof COLLECTIONS)[number]['name'];

export interface CollectionConfig {
  id: string;
  chain: string;
}

export interface AICollection {
  id: string;
  chain: string;
  name: string;
  logo: string;
  hasRarity?: boolean;
  description?: string;
  categories?: string[];
  contracts?: string[];
  twitter?: string;
  discord?: string;
  website?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface AINft {
  nftId: string;
  collectionId: string;
  collectionName: string;
  chain: string;
  contractAddress: string;
  tokenId: string;
  tokenURI: string;
  name: string;
  image: string;
  traits: {
    type: string;
    value: string;
  }[];
  rarity: {
    score: number;
    rank: number;
  };
  mint: {
    to: string;
    quantity: number;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  };
  aiAgent: AIAgent;
  agentId: string;
  agentAccount: {
    solana: string;
    evm: string;
  };
  updatedAt: Date;
  createdAt: Date;
}

export interface AINftActivity {
  _id?: string;
  chain: string;
  collectionId: string;
  from: string;
  to: string;
  action: string;
  quantity: number;
  txHash: string;
  time: Date;
  blockNumber: number;
  tokenId: string;
  contractAddress: string;
  contractType: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface AINftOwner {
  chain: string;
  ownerAddress: string;
  collectionId: string;
  contractAddress: string;
  tokenId: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface AIAgent {
  engine: 'eliza';
  character: Character;
}

export interface KeyStore {
  key: string;
  value: any;
}

export interface CharacterConfig extends Partial<Character> {}

export interface NftConfig {
  nftId: string;
  chain?: string;
  characterConfig?: CharacterConfig;
  trade?: TradeSettingsSolana | TradeSettingsEvm;
  tradeSettings?: {
    [key: string]: TradeSettingsSolana | TradeSettingsEvm;
  };
}

export interface TradeSettingsSolana {
  slippage: number;
  priorityFee: number;
  tip: number;
  mode: 'FAST' | 'ANTI_MEV';
}

export interface TradeSettingsEvm {
  chain: string;
  slippage: number; // 0.01 = 1%
  mode?: 'FAST' | 'ANTI_MEV';
  gasMode?: 'LOW' | 'AVG' | 'HIGH' | 'CUSTOM';
  maxFeePerGas?: number; // Gwei, fill this when gasMode is CUSTOM
  maxPriorityFeePerGas?: number; // Gwei
  tip?: number; // Gwei
}

export function getChainDefaultTradeSettings(chain: string): TradeSettingsSolana | TradeSettingsEvm {
  if (chain === 'solana') {
    return DEFAULT_TRADE_SETTINGS_SOLANA;
  }
  return DEFAULT_TRADE_SETTINGS_EVM;
}

export const DEFAULT_TRADE_SETTINGS_SOLANA: TradeSettingsSolana = {
  slippage: 0.25,
  priorityFee: 0.006,
  tip: 0.001,
  mode: 'FAST',
};

export const DEFAULT_TRADE_SETTINGS_EVM: TradeSettingsEvm = {
  chain: undefined,
  slippage: 0.25,
  mode: 'FAST',
  gasMode: 'AVG',
  tip: 0,
};

export interface CoreSettings {
  category: 'httpProxy';
  value: {
    product: 'datacenterProxies';
    username: string;
    password: string;
    // example.com
    entryPoint: string;
    // 8001
    port: string;
    country: string;
    assignedIP: string;
    httpProxy: string;
    // how many agent using this proxy
    count: number;
  };
}

export interface NftPrologues {
  _id?: string;
  chain: string;
  nftId: string;
  tokenId: string;
  prologue: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface NftPrimaryCoin {
  _id?: string;
  chain: string;
  nftId: string;
  coinInfo: {
    name: string;
    symbol: string;
    image: string;
    description: string;
    twitter?: string;
    telegram?: string;
    website?: string;
  };
  metadataUri: string;
  initialBuyAmountSol: number;
  mintAddress: string;
  mintSecretKey: string; // base58 encoded secret key
  created: boolean;

  updatedAt: Date;
  createdAt: Date;
}

export interface AddressNonce {
  chain: string;
  address: string;
  nonceType: NonceType;
  message: string;
  expiration: Date;
  updatedAt: Date;
}

export interface CopyTrade {
  _id?: string;
  id: number;
  agentId: string;
  name: string;
  chain: string;
  targetAddress: string;
  walletAddress: string;
  copySell: boolean;
  mode: 'fixedAmount' | 'percentage';
  fixedAmount?: number;
  percentage?: number;
  expiredAt?: number;
  status: 'running' | 'paused' | string;
  createdAt: Date;
}

export interface LimitOrder {
  id: string;
  chain: string;
  agentId: string;
  inputTokenSymbol: string | null;
  outputTokenSymbol: string | null;
  inputTokenCA: string | null;
  outputTokenCA: string | null;
  inputTokenAmount: number | string | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: number | string | null;
  delay: string | null;
  startAt: Date | null;
  expireAt: Date;
  priceCondition: 'below' | 'above' | null;
  targetPrice: number | null;
  targetToken: string | null;
  targetTokenCA: string;
}

export type NonceType = 'claim' | 'login';
