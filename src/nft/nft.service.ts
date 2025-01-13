import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { NftgoService } from '../shared/nftgo.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { AICollection, AINft } from '../shared/mongo/types.js';
import {
  AssetsByCollection,
  NftSearchOptions,
  transformToAINft,
} from './nft.types.js';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';

@Injectable()
export class NftService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongoService: MongoService,
    private readonly elizaManager: ElizaManagerService,
  ) {
    this.logger.setContext('NftService');
  }

  onApplicationBootstrap() {
    this.subscribeAINfts().catch((e) => {
      this.logger.error(e);
    });
    this.startAIAgents().catch((e) => {
      this.logger.error(e);
    });
  }

  // Start AI agents for all indexed NFTs
  async startAIAgents() {
    const cursor = await this.mongoService.nfts
      .find({})
      .addCursorFlag('noCursorTimeout', true)
      .sort({ _id: 1 });
    while (await cursor.hasNext()) {
      const nft = await cursor.next();
      if (!nft || nft.aiAgent.engine != 'eliza') {
        continue;
      }
      this.elizaManager.startNftAgent({
        chain: nft.chain,
        nftId: nft.nftId,
        character: nft.aiAgent.character,
      });
    }
  }

  // Subscribe to AI NFTs via NFTGO API
  async subscribeAINfts(): Promise<void> {
    const collections = await this.nftgo.getAICollections('solana');
    for (const collection of collections) {
      const result = await this.nftgo.getAINftsByCollection(
        'solana',
        collection.id,
      );
      const nfts = result.nfts.map((nft) => transformToAINft(nft));
      await this.mongoService.nfts.bulkWrite(
        nfts.map((nft) => ({
          updateOne: {
            filter: { id: nft.nftId },
            update: { $set: nft },
            upsert: true,
          },
        })),
      );
    }
  }

  async claimInitialFunds(chain: string, nftId: string): Promise<void> {
    this.logger.log(`Claiming initial funds for NFT ${nftId}`);
    // check ownership
    // get nft private account
    // claim
  }

  async getCollections(chain: string): Promise<AICollection[]> {
    const collections = await this.mongoService.collections
      .find({ chain })
      .toArray();
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
    const nfts = await this.mongoService.nfts
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
    const nfts = await this.mongoService.nfts.find(filter).toArray();
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
