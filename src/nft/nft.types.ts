import { AIAgent, AINft } from '../shared/mongo/types.js';
import { NftgoAINft } from '../shared/nftgo.service.js';
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

export function transformToAINft(nft: NftgoAINft): AINft {
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
