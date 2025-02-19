import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { NftgoService } from '../shared/nftgo.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { CharacterConfig, AICollection, AINft } from '../shared/mongo/types.js';
import {
  AssetsByCollection,
  NEW_AI_NFT_EVENT,
  NftSearchOptions,
} from './nft.types.js';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AddressService } from '../address/address.service.js';
import { stringToUuid } from '@elizaos/core';
import { deepMerge, sleep } from '../shared/utils.service.js';

@Injectable()
export class NftService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongo: MongoService,
    private readonly elizaManager: ElizaManagerService,
    private readonly addressService: AddressService,
    private readonly eventEmitter: EventEmitter2,
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
    await this.elizaManager.startAgentServer();
    const configedNfts = await this.mongo.nftConfigs.find().toArray();
    const configedNftIds = configedNfts.map((nft) => nft.nftId);
    const cursor = this.mongo.nfts
      .find({ chain: 'solana', nftId: { $in: configedNftIds } })
      .addCursorFlag('noCursorTimeout', true);
    while (await cursor.hasNext()) {
      const nft = await cursor.next();
      await this.eventEmitter.emit(NEW_AI_NFT_EVENT, [nft]);
      await sleep(1500);
    }
  }

  @OnEvent(NEW_AI_NFT_EVENT, { async: true })
  async handleNewAINfts(nfts: AINft[], restart?: boolean): Promise<void> {
    for (const nft of nfts) {
      if (nft?.aiAgent?.engine !== 'eliza') {
        return;
      }
      const isAgentRunning = await this.elizaManager.isAgentRunning(
        nft.agentId,
      );
      if (isAgentRunning && !restart) {
        this.logger.log(`Agent for NFT ${nft.nftId} is already running`);
        return;
      }
      if (isAgentRunning && restart) {
        this.logger.log(`Restarting agent for NFT ${nft.nftId}`);
        await this.elizaManager.stopAgent(nft.agentId);
      }
      this.logger.log(
        `Starting agent for NFT ${nft.nftId}, characterName: ${nft.aiAgent.character.name}`,
      );
      const nftConfig = await this.mongo.nftConfigs.findOne({
        nftId: nft.nftId,
      });
      await this.elizaManager.startAgentLocal({
        chain: nft.chain,
        nftId: nft.nftId,
        character: nft.aiAgent.character,
        characterConfig: nftConfig?.characterConfig,
      });
    }
  }

  async updateNftConfig({
    nftId,
    characterConfig,
  }: {
    nftId: string;
    characterConfig: CharacterConfig;
  }) {
    const nftConfig = await this.mongo.nftConfigs.findOne({
      nftId,
    });
    characterConfig = deepMerge(nftConfig?.characterConfig, characterConfig);
    await this.mongo.nftConfigs.updateOne(
      { nftId },
      {
        $set: {
          characterConfig,
        },
      },
      { upsert: true },
    );
    const nft = await this.mongo.nfts.findOne({ nftId });
    void this.handleNewAINfts([nft], true);
    return {
      characterConfig,
    };
  }

  async getNftConfig(nftId: string) {
    const nftConfig = await this.mongo.nftConfigs.findOne({
      nftId,
    });
    return nftConfig;
  }

  async deleteNftConfig(nftId: string) {
    await this.mongo.nftConfigs.deleteOne({ nftId });
    const nft = await this.mongo.nfts.findOne({ nftId });
    void this.handleNewAINfts([nft], true);
  }

  async getAgentOwner(agentId: string) {
    const nft = await this.mongo.nfts.findOne({ agentId });
    if (!nft) {
      return null;
    }
    const owner = await this.mongo.nftOwners.findOne({
      chain: nft.chain,
      contractAddress: nft.contractAddress,
      tokenId: nft.tokenId,
    });
    return owner;
  }

  async isNftAdmin(chain: string, address: string, nftId: string) {
    const nft = await this.mongo.nfts.findOne({ nftId });
    if (!nft) {
      return false;
    }
    const owner = await this.mongo.nftOwners.findOne({
      chain: nft.chain,
      contractAddress: nft.contractAddress,
      tokenId: nft.tokenId,
    });
    return owner?.ownerAddress === address;
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
          sort['rarity.rank'] = 1;
      }
    }
    if (opts.traitsQuery) {
      const traitFilters = opts.traitsQuery.map((trait) => ({
        traits: {
          $elemMatch: {
            type: trait.traitType,
            value: trait.traitValue,
          },
        },
      }));
      filter['$and'] = traitFilters;
    }
    const nfts = await this.mongo.nfts
      .find(filter, {
        sort,
        limit: opts.limit,
        skip: opts.offset,
      })
      .toArray();
    const nftDetails = await Promise.all(
      nfts.map(async (nft) => {
        const owner = await this.mongo.nftOwners.findOne({
          chain: opts.chain,
          contractAddress: nft.contractAddress,
          tokenId: nft.tokenId,
        });
        return {
          ...nft,
          agentId: stringToUuid(nft.nftId),
          owner: owner?.ownerAddress,
        };
      }),
    );
    return nftDetails;
  }

  async getCollectionMetrics(chain: string, collectionId: string) {
    return await this.nftgo.getCollectionMetrics(collectionId);
  }

  async getCollectionById(chain: string, id: string) {
    const collection = await this.mongo.collections.findOne({ id, chain });
    const metrics = await this.getCollectionMetrics(chain, id);
    const nftsCount = await this.mongo.nfts.countDocuments({
      chain,
      collectionId: id,
    });
    return {
      collection: {
        ...collection,
        nftsCount,
      },
      metrics,
    };
  }

  async getFilterTemplate(chain: string, collectionId: string) {
    const traits = await this.mongo.nfts
      .aggregate([
        {
          $match: {
            collectionId,
            chain,
          },
        },
        { $unwind: '$traits' },
        {
          $group: {
            _id: {
              traitType: '$traits.type',
              traitValue: '$traits.value',
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.traitType',
            traitValues: {
              $push: {
                value: '$_id.traitValue',
                count: '$count',
              },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            traitType: '$_id',
            traitValues: 1,
            _id: 0,
          },
        },
      ])
      .toArray();
    return { traits };
  }

  async getNftById(chain: string, nftId: string) {
    const nft = await this.mongo.nfts.findOne({ nftId, chain });
    if (!nft) {
      return null;
    }
    const agentId = stringToUuid(nft.nftId);
    const agentAccount =
      nft.agentAccount ??
      (await this.elizaManager.getAgentAccount(chain, nftId));
    const nftOwner = await this.mongo.nftOwners.findOne({
      chain,
      contractAddress: nft.contractAddress,
      tokenId: nft.tokenId,
    });

    return {
      ...nft,
      agentId,
      agentAccount,
      owner: nftOwner?.ownerAddress,
    };
  }

  async getNftsByOwner(
    chain: string,
    ownerAddress: string,
    collectionId?: string,
  ) {
    const filter: any = {
      chain,
      ownerAddress,
    };
    if (collectionId) {
      filter.collectionId = collectionId;
    }
    const nftDocs = await this.mongo.nftOwners
      .aggregate([
        {
          $lookup: {
            from: 'nfts',
            let: {
              chain: '$chain',
              contractAddress: '$contractAddress',
              tokenId: '$tokenId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$chain', '$$chain'] },
                      { $eq: ['$contractAddress', '$$contractAddress'] },
                      { $eq: ['$tokenId', '$$tokenId'] },
                    ],
                  },
                },
              },
            ],
            as: 'nft',
          },
        },
        {
          $match: filter,
        },
        {
          $unwind: {
            path: '$nft',
          },
        },
        {
          $project: {
            nft: 1,
          },
        },
      ])
      .toArray();
    // group by collection
    const assets: AssetsByCollection = {};

    for (const nftDoc of nftDocs) {
      const nft = nftDoc.nft;
      if (!assets[nft.collectionId]) {
        assets[nft.collectionId] = {
          collectionId: nft.collectionId,
          collectionName: nft.collectionName,
          nfts: [],
        };
      }
      const agentAccount =
        nft.agentAccount ??
        (await this.elizaManager.getAgentAccount(chain, nft.nftId));
      const agentId = nft.agentId ?? stringToUuid(nft.nftId);
      assets[nft.collectionId].nfts.push({
        ...nft,
        agentId,
        agentAccount,
      });
    }
    return assets;
  }
}
