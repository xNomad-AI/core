import {
  AIAgent, AICollection,
  AINft,
  AINftActivity,
  AINftOwner,
} from '../shared/mongo/types.js';
import { Collection, Nft, NftTx } from '../shared/nftgo.service.js';
import { IsOptional, IsString, IsInt, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export type NftSearchOptions = {
  chain: string;
  collectionId: string;
  keyword?: string;
  sortBy?: NftSearchSortBy;
  limit: number;
  offset: number;
};

export type NftSearchSortBy = 'rarityDesc' | 'numberAsc' | 'numberDesc';

export function transformToAINft(nft: Nft): AINft {
  return {
    nftId: nft.nft_id,
    chain: nft.chain,
    collectionId: nft.collection_name,
    collectionName: nft.collection_name,
    contractAddress: nft.contract_address,
    image: nft.image,
    name: nft.name,
    tokenId: nft.token_id,
    tokenURI: nft.image,
    rarity: nft.rarity,
    traits: nft.traits,
    aiAgent: nft.extra_info['ai_agent'] as AIAgent,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
}

export class NftSearchQueryDto {
  @IsOptional()
  sortBy?: NftSearchSortBy;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Transform(({ value }: { value: string | number }) =>
    parseInt(value as string, 10),
  )
  @IsInt()
  @Min(0)
  offset: number = 0;

  @IsOptional()
  @Transform(({ value }: { value: string | number }) =>
    parseInt(value as string, 10),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 100;
}

export interface AssetsByCollection {
  [collectionId: string]: {
    collectionId: string;
    collectionName?: string;
    nfts: AINft[];
  };
}

export function transformToActivity(
  collectionId: string,
  tx: NftTx,
): AINftActivity {
  return {
    action: tx.action,
    collectionId: collectionId,
    blockNumber: tx.block_number,
    chain: tx.blockchain,
    contractAddress: tx.nft.contract_address,
    contractType: tx.nft.contract_type,
    createdAt: new Date(),
    from: tx.from_address,
    quantity: tx.quantity,
    time: new Date(tx.time * 1000),
    to: tx.to_address,
    tokenId: tx.nft.contract_address,
    txHash: tx.tx_hash,
    updatedAt: new Date(),
  };
}

export function transformToOwner(activity: AINftActivity): AINftOwner {
  return {
    chain: activity.chain,
    collectionId: activity.collectionId,
    contractAddress: activity.contractAddress,
    tokenId: activity.tokenId,
    createdAt: new Date(),
    ownerAddress: activity.to,
    updatedAt: new Date(),
  };
}

export function transformToAICollection(
  coll: Collection
): AICollection {
  return {
    id: coll.collection_id,
    name: coll.name,
    chain: coll.chain,
    logo: coll.logo,
    categories: coll.categories,
    contracts: coll.contracts,
    description: coll.description,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export const NEW_AI_NFT_EVENT = 'new-ai-nft';
