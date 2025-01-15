import { COLLECTIONS } from './configs.js';
import { Character } from '@elizaos/core';

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
  aiAgent: AIAgent;
  updatedAt: Date;
  createdAt: Date;
}

export interface AIAgent {
  engine: 'eliza';
  character: Character;
}
