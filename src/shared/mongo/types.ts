import { COLLECTIONS } from './configs.js';

export type CollectionName = (typeof COLLECTIONS)[number]['name'];

export interface AICollection extends Document {
  collection_id: string;
  collection_name: string;
  created_date: Date;
}

export interface AINft extends Document {
  nft_id: string;
  collection_id: string;
  collection_name: string;
  token_id: string;
  token_uri: string;
  owner: string;
  created_date: Date;
}
