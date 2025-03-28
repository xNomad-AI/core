import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { sleep, startIntervalTask } from '../shared/utils.service.js';
import {
  transformToActivity,
  transformToAICollection,
  transformToAINft,
  transformToOwner,
} from './nft.types.js';
import { CollectionTxs, NftgoService } from '../shared/nftgo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { ConfigService } from '@nestjs/config';
import { stringToUuid } from '@elizaos/core';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';
import { AICollection } from '../shared/mongo/types';

const SYNC_NFTS_INTERVAL = 1000 * 60 * 2;
const SYNC_TXS_INTERVAL = 1000 * 10;

@Injectable()
export class NftSyncService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly elizaManager: ElizaManagerService,
  ) {
    this.logger.setContext(NftSyncService.name);
  }

  onApplicationBootstrap() {
    // this.subscribeAINfts().catch((e) => {
    //   this.logger.error(e);
    // });
  }

  // subscribe AI Nft txs
  async subscribeAINfts(): Promise<void> {
    for (const collection of await this.getAICollections()) {
      startIntervalTask(
        'syncCollectionTxs',
        () => this.syncCollectionTxs(collection.id, collection.chain),
        SYNC_TXS_INTERVAL,
      );
      startIntervalTask(
        'syncCollectionNfts',
        () => this.syncCollectionNfts(collection.id, collection.chain),
        SYNC_NFTS_INTERVAL,
      );
    }
  }

  async getAICollections() {
    const configedCollections = await this.mongo.collectionConfigs.find({}).toArray();
    const chainCollections = configedCollections.reduce((acc, cur) => {
      if (!acc[cur.chain]) {
        acc[cur.chain] = [];
      }
      acc[cur.chain].push(cur.id);
      return acc;
    }, {});

    const aiCollections: AICollection[] = [];
    for (const chain in chainCollections) {
      this.logger.log(`Fetched ${chain} ${chainCollections[chain]?.length} AI collections`);
      const collections = await this.nftgo.getAICollections(chain, chainCollections[chain]);
      aiCollections.push(...collections.map(transformToAICollection));
    }


    const bulkOperations = aiCollections.map((coll) => ({
      updateOne: {
        filter: { id: coll.id, chain: coll.chain },
        update: { $set: coll },
        upsert: true,
      },
    }));
    if (bulkOperations.length > 0) {
      await this.mongo.collections.bulkWrite(bulkOperations);
    }
    return aiCollections;
  }

  async syncCollectionTxs(collectionId: string, chain: string) {
    const key = `collection-${collectionId}-txs-progress`;
    let cursor = await this.mongo.getKeyStore(key);
    let startTime = undefined;
    if (!cursor) {
      const latestTx = await this.mongo.nftActivities.findOne(
        { collectionId },
        { sort: { time: -1 } },
      );
      startTime = latestTx?.time
        ? latestTx.time.getTime() / 1000 + 1
        : undefined;
    }
    do {
      try {
        const result = await this.nftgo.getCollectionTxs(
          chain,
          collectionId,
          {
            limit: 50,
            startTime,
            cursor,
          },
        );
        this.logger.log(
          `Fetched ${result?.transactions.length} txs for collection: ${collectionId}`,
        );
        await this.processCollectionTxs(collectionId, result);
        cursor = result.next_cursor;
        await sleep(100);
      } catch (error) {
        this.logger.error(
          `Error syncing txs for collection: ${collectionId}`,
          error,
        );
        await sleep(60000);
      }
    } while (cursor);
  }

  async syncCollectionNfts(collectionId: string, chain: string) {
    const key = `collection-${collectionId}-nfts-progress`;
    let cursor = await this.mongo.getKeyStore(key);
    do {
      try {
        const result = await this.nftgo.getCollectionNfts(
          chain,
          collectionId,
          {
            limit: 50,
            cursor,
          },
        );
        this.logger.log(
          `Fetched ${result?.nfts.length} nfts for collection: ${collectionId}, cursor: ${cursor}, name: ${result?.nfts[0]?.name}`,
        );
        const nfts = [];
        for (const nft of result.nfts) {
          const transformedNft = await transformToAINft(nft);
          if (!transformedNft.aiAgent) {
            this.logger.warn(
              `this nft is not AI-NFT, nftId: ${transformedNft.nftId}`,
            );
            continue;
          }
          transformedNft.agentId = stringToUuid(transformedNft.nftId);
          transformedNft.agentAccount = await this.elizaManager.getAgentAccount(
            chain,
            transformedNft.nftId,
          );
          nfts.push(transformedNft);
        }
        await this.mongo.nfts.bulkWrite(
          nfts.map((nft) => ({
            updateOne: {
              filter: { id: nft.nftId },
              update: { $set: nft },
              upsert: true,
            },
          })),
        );
        if (result.next_cursor) {
          await this.mongo.updateKeyStore(key, result.next_cursor);
        }
        //   this.eventEmitter.emit(NEW_AI_NFT_EVENT, nfts);
        cursor = result.next_cursor;
        await sleep(100);
      } catch (error) {
        this.logger.error(
          `Error syncing nfts for collection: ${collectionId}`,
          error,
        );
        await sleep(60000);
      }
    } while (cursor);
  }

  async processCollectionTxs(collectionId: string, txs: CollectionTxs) {
    const key = `collection-${collectionId}-txs-progress`;
    const session = await this.mongo.client.startSession();
    await session.withTransaction(async () => {
      for (const tx of txs.transactions) {
        const activity = transformToActivity(collectionId, tx);
        const owner = transformToOwner(activity);
        await this.mongo.nftActivities.updateOne(
          {
            chain: activity.chain,
            txHash: activity.txHash,
            contractAddress: activity.contractAddress,
            tokenId: activity.tokenId,
            from: activity.from,
          },
          { $set: activity },
          { upsert: true, session },
        );
        await this.mongo.nftOwners.updateOne(
          {
            chain: activity.chain,
            contractAddress: activity.contractAddress,
            tokenId: activity.tokenId,
          },
          { $set: owner },
          { upsert: true, session },
        );
      }
      if (txs.next_cursor) {
        await this.mongo.updateKeyStore(key, txs.next_cursor, session);
      }
    });
    await session.endSession();
  }
}
