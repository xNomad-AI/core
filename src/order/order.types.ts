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

export enum Marketplace {
  MAGIC_EDEN = 'magiceden',
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
  sellerReferral?: string;
  expiry?: number;
  priorityFee?: number;
}

export interface BidNFTParams {
  buyerAddress: string;
  tokenMintAddress: string;
  price: number;
  buyerReferralAddress?: string;
  expiry?: number;
  priorityFee?: number;
}

export interface AcceptOfferParams {
  buyerAddress: string;
  sellerAddress: string;
  tokenMintAddress: string;
  tokenATAAddress: string;
  price: number;
  newPrice: number;
  sellerExpiry: number;
  buyerReferralAddress?: string;
  sellerReferralAddress?: string;
  buyerExpiry?: number;
  priorityFee?: number;
}


export interface CancelListingParams {
  sellerAddress: string;
  tokenMintAddress: string;
  tokenAccountAddress: string;
  price: number;
  sellerReferralAddress?: string;
  expiry?: number;
  priorityFee?: number;
}

export interface CancelOfferParams {
  buyerAddress: string;
  tokenMintAddress: string;
  price: number;
  buyerReferralAddress?: string;
  expiry?: number;
  priorityFee?: number;
}