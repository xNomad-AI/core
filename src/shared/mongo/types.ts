import { COLLECTIONS } from './configs.js';

export type CollectionName = (typeof COLLECTIONS)[number]['name'];

export interface AICollection {
  _id?: string;
  chain: string;
  collectionId: string;
  collectionName: string;
  twitter?: string;
  discord?: string;
  website?: string;
  createdAt: Date;
}

export interface AINft {
  _id?: string;
  nftId: string;
  collectionId: string;
  collectionName: string;
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
  updatedAt: Date;
  createdAt: Date;
}
