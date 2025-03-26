import {
  AIAgent,
  AICollection,
  AINft,
  AINftActivity,
  AINftOwner,
} from '../shared/mongo/types.js';
import { Collection, Nft, NftTx } from '../shared/nftgo.service.js';
import {
  IsOptional,
  IsString,
  IsInt,
  Max,
  Min,
  IsArray,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Utility function for blockchain address case conversion
export function normalizeBlockchainAddress(blockchain: string, address: string): string {
  return blockchain.toLowerCase() === 'solana' ? address : address.toLowerCase();
}

export type NftSearchOptions = {
  chain: string;
  collectionId: string;
  keyword?: string;
  sortBy?: NftSearchSortBy;
  limit: number;
  offset: number;
  traitsQuery?: { traitValue: string; traitType: string }[];
};

export type NftSearchSortBy =
  | 'rarityDesc'
  | 'numberAsc'
  | 'numberDesc'
  | 'mintTimeDesc';

export async function transformToAINft(nft: Nft): Promise<AINft> {
  // to lower case
  nft.contract_address = normalizeBlockchainAddress(nft.blockchain, nft.contract_address);
  if (nft.created && nft.created.minted_to) {
    nft.created.minted_to = normalizeBlockchainAddress(nft.blockchain, nft.created.minted_to);
  }
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
    mint: {
      to: nft.created.minted_to,
      quantity: nft.created?.quantity || 1,
      timestamp: nft.created?.timestamp,
      blockNumber: nft.created.block_number,
      txHash: nft.created.transaction,
    },
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

  // Traits query with a proper transformation to an array of objects
  @IsOptional()
  @IsArray()
  @Transform(({ value }: { value: string }) => {
    try {
      return JSON.parse(value);
    } catch (e) {
      return []; // Return an empty array if the string is not valid JSON
    }
  })
  @IsArray()
  @IsObject({ each: true })
  traitsQuery?: { traitValue: string; traitType: string }[];
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
  const contractAddress = normalizeBlockchainAddress(tx.blockchain, tx.nft.contract_address);
  const tokenId = normalizeBlockchainAddress(tx.blockchain, tx.nft.token_id);
  const from = normalizeBlockchainAddress(tx.blockchain, tx.from_address);
  const to = normalizeBlockchainAddress(tx.blockchain, tx.to_address);
  const txHash = normalizeBlockchainAddress(tx.blockchain, tx.tx_hash);

  return {
    action: tx.action,
    collectionId: collectionId,
    blockNumber: tx.block_number,
    chain: tx.blockchain,
    contractAddress: contractAddress || tokenId,
    tokenId: tokenId || contractAddress,
    contractType: tx.nft.contract_type,
    createdAt: new Date(),
    from,
    quantity: tx.quantity,
    time: new Date(tx.time * 1000),
    to,
    txHash,
    updatedAt: new Date(),
  };
}

export function transformToOwner(activity: AINftActivity): AINftOwner {
  const ownerAddress = normalizeBlockchainAddress(activity.chain, activity.to);
  const contractAddress = normalizeBlockchainAddress(activity.chain, activity.contractAddress);
  return {
    chain: activity.chain,
    collectionId: activity.collectionId,
    contractAddress,
    tokenId: activity.tokenId,
    createdAt: new Date(),
    ownerAddress,
    updatedAt: new Date(),
  };
}

export function transformToAICollection(coll: Collection): AICollection {
  coll.contracts = coll.contracts.map(contract => 
    normalizeBlockchainAddress(coll.blockchain, contract)
  );

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
