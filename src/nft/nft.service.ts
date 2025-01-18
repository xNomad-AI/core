import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { NftgoService } from '../shared/nftgo.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { AICollection, AINft } from '../shared/mongo/types.js';
import {
  AssetsByCollection,
  NEW_AI_NFT_EVENT,
  NftSearchOptions,
} from './nft.types.js';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';
import { NFT_PERMISSION_DENIED_EXCEPTION } from '../shared/exceptions/nft-permission-denied-exception.js';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NftService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongo: MongoService,
    private readonly elizaManager: ElizaManagerService,
  ) {
    this.logger.setContext(NftService.name);
  }

  onApplicationBootstrap() {
    this.startAIAgents().catch((e) => {
      this.logger.error(e);
    });
  }

  // Start AI agents for all indexed NFTs
  async startAIAgents() {
    const cursor = await this.mongo.nfts
      .find({})
      .addCursorFlag('noCursorTimeout', true)
      .sort({ _id: 1 });
    while (await cursor.hasNext()) {
      const nft = await cursor.next();
      await this.handleNewAINfts([nft]);
    }
    await this.elizaManager.startAgentServer();
  }

  @OnEvent(NEW_AI_NFT_EVENT, { async: true })
  async handleNewAINfts(nfts: AINft[]) {
    for (const nft of nfts) {
      if (nft?.aiAgent.engine !== 'eliza') {
        return;
      }
      this.logger.log(
        `Starting agent for NFT ${nft.nftId}, characterName: ${nft.aiAgent.character.name}`,
      );
      await this.elizaManager.startAgentLocal({
        chain: nft.chain,
        nftId: nft.nftId,
        character: nft.aiAgent.character,
      });
    }
  }

  async claimInitialFunds(parms: {
    chain: string;
    nftId: string;
    ownerAddress: string;
    signature: string;
  }): Promise<void> {
    const { chain, nftId, ownerAddress } = parms;
    this.logger.log(
      `Claiming initial funds for NFT ${nftId}, owner: ${ownerAddress}`,
    );
    const owner = await this.mongo.nftOwners.findOne({
      chain,
      nftId,
    });
    if (owner?.ownerAddress !== ownerAddress) {
      throw NFT_PERMISSION_DENIED_EXCEPTION;
    }
  }

  async getCollections(chain: string): Promise<AICollection[]> {
    const collections = await this.mongo.collections.find({ chain }).toArray();
    return collections;
  }

  async getNfts(opts: NftSearchOptions): Promise<AINft[]> {
    const filter: object = {
      chain: opts.chain,
      collectionId: opts.collectionId,
      ...(opts.keyword && { name: { $regex: opts.keyword, $options: 'i' } }),
    };
    const sort = {};
    if (opts.sortBy) {
      switch (opts.sortBy) {
        case 'numberAsc':
          sort['name'] = 1;
          break;
        case 'numberDesc':
          sort['name'] = -1;
          break;
        case 'rarityDesc':
          sort['rarity.score'] = -1;
      }
    }
    const nfts = await this.mongo.nfts
      .find(filter, {
        sort,
        limit: opts.limit,
        skip: opts.offset,
      })
      .toArray();
    return nfts;
  }

  async getCollectionMetrics(chain: string, collectionId: string) {
    return await this.nftgo.getCollectionMetrics(collectionId);
  }

  async getNftsByOwner(chain: string, owner: string, collectionId?: string) {
    const filter = {
      chain,
      owner,
      collectionId,
    };
    const nfts = await this.mongo.nfts.find(filter).toArray();
    // group by collection
    const assets: AssetsByCollection = nfts.reduce((acc, nft) => {
      if (!acc[nft.collectionId]) {
        acc[nft.collectionId] = {
          collectionId: nft.collectionId,
          collectionName: nft.collectionName,
          nfts: [],
        };
      }
      acc[nft.collectionId].nft.push(nft);
      return acc;
    }, {});
    return assets;
  }
}
