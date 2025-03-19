import { PublicKey } from '@solana/web3.js';

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum OrderType {
  LIST = 'list',
  OFFER = 'offer',
  ACCEPT_OFFER = 'accept_offer',
  CANCEL_LISTING = 'cancel_listing',
  CANCEL_OFFER = 'cancel_offer',
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

export interface ListNFTParams {
  sellerAddress: string;
  tokenMintAddress: string;
  tokenAccountAddress: string;
  price: number;
}