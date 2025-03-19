import { Character } from '@elizaos/core';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from './configs.js';
import { OrderStatus, OrderType } from '../../order/order.types.js';

export type CollectionName = (typeof COLLECTIONS)[number]['name'];

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
  trade?: TradeSettings;
}

export interface TradeSettings {
  slippage: number;
  priorityFee: number;
  tip: number;
  mode: 'FAST' | 'ANTI_MEV';
}

export const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  slippage: 0.25,
  priorityFee: 0.006,
  tip: 0.001,
  mode: 'FAST',
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
  targetAddress: string;
  walletAddress: string;
  copySell: boolean;
  mode: 'fixedAmount' | 'percentage';
  fixedAmount?: number;
  percentage?: number;
  expiredAt?: number;
  status: 'running' | 'paused';
  createdAt: Date;
}

export type NonceType = 'claim' | 'login';

export type SwarmMintStageKind = 'public' | 'whitelist';

export interface SwarmMintStage {
  name: string;
  price: number;
  maxMintsPerAddress: number;
  startTime: number;
  endTime: number;
  whitelistAddresses?: string[];
}

export interface Swarm {
  _id: ObjectId;
  chain: string;
  name: string;
  logo: string;
  description: string;
  creatorInfo: {
    address: string;
    email: string;
    recipientAddress: string;
    royaltyBps: number;
  };
  socialMedia: {
    website: string;
    discord: string;
    twitter: string;
  };
  aiAgentSettings: {
    background: string;
    style: string[];
  };
  mintStages: SwarmMintStage[];
  allowBindAgentToken: boolean;

  collectionAddress: string;
  candyMachine: {
    prefixName: string;
    prefixUri: string;
    address: string;
    itemsLoaded: number;
  };
  maxSupply: number;
  collectionMetadataUri: string;
  nftMetadataUploaded: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  _id?: string;
  txHash: string;
  nftId: string;
  chain: string;
  contractAddress: string;
  tokenId: string;
  type: OrderType;
  status: OrderStatus;
  price: number;
  from: string;
  to: string;
  timestamp: Date;
  marketplace: string;
  blockNumber?: number;
  updatedAt: Date;
  createdAt: Date;
}
