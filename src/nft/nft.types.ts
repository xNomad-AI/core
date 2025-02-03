import {
  AIAgent,
  AICollection,
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

export async function transformToAINft(nft: Nft): Promise<AINft> {
  // solana and some non-evm chain's NFT has either token_id or contract_address, not both
  const tokenId = nft.token_id || nft.contract_address;
  const contractAddress = nft.contract_address || nft.token_id;

  // Try to get aiAgent from extra_info or fetch metadata if necessary
  let aiAgent = nft.extra_info?.['ai_agent'];
  if (!aiAgent && nft.extra_info?.['metadata_original_url']) {
    try {
      const metadata = await fetch(
        nft.extra_info['metadata_original_url'] as string,
      ).then((res) => {
        return res.json();
      });
      aiAgent = metadata?.ai_agent;
    } catch (error) {
      console.error('Error fetching metadata:', error);
    }
  }

  // Construct the AINft object
  return {
    nftId: `${nft.blockchain}:${contractAddress}:${tokenId}`,
    chain: nft.blockchain,
    collectionId: nft.collection.collection_id,
    collectionName: nft.collection_name,
    contractAddress: contractAddress,
    image: nft.image,
    name: nft.name,
    tokenId: tokenId,
    tokenURI: nft.image,
    rarity: nft.rarity,
    traits: nft.traits,
    aiAgent: aiAgent as AIAgent,
    agentAccount: undefined,
    agentId: undefined,
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
    contractAddress: tx.nft.contract_address || tx.nft.token_id,
    tokenId: tx.nft.token_id || tx.nft.contract_address,
    contractType: tx.nft.contract_type,
    createdAt: new Date(),
    from: tx.from_address,
    quantity: tx.quantity,
    time: new Date(tx.time * 1000),
    to: tx.to_address,
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

export function transformToAICollection(coll: Collection): AICollection {
  return {
    id: coll.collection_id,
    name: coll.name,
    chain: coll.blockchain,
    logo: coll.logo,
    categories: coll.categories,
    contracts: coll.contracts,
    description: coll.description,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export const NEW_AI_NFT_EVENT = 'new-ai-nft';
