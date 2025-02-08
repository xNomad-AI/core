import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { sleep, startIntervalTask } from '../shared/utils.service.js';
import {
  NEW_AI_NFT_EVENT,
  transformToActivity,
  transformToAICollection,
  transformToAINft,
  transformToOwner,
} from './nft.types.js';
import { CollectionTxs, Nft, NftgoService } from '../shared/nftgo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { stringToUuid } from '@elizaos/core';
import { ElizaManagerService } from '../agent/eliza-manager.service.js';

const SYNC_NFTS_INTERVAL = 1000 * 60;
const SYNC_TXS_INTERVAL = 1000 * 10;

@Injectable()
export class NftSyncService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly elizaManager: ElizaManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.logger.setContext(NftSyncService.name);
  }

  onApplicationBootstrap() {
    this.subscribeAINfts().catch((e) => {
      this.logger.error(e);
    });
  }

  // subscribe AI Nft txs
  async subscribeAINfts(): Promise<void> {
    for (const collection of await this.getAICollections()) {
      startIntervalTask(
        'syncCollectionTxs',
        () => this.syncCollectionTxs(collection.id),
        SYNC_TXS_INTERVAL,
      );
      startIntervalTask(
        'syncCollectionNfts',
        () => this.syncCollectionNfts(collection.id),
        SYNC_NFTS_INTERVAL,
      );
    }
  }

  async getAICollections() {
    const cids = this.config.get<string>('NFTGO_SOLANA_AI_COLLECTIONS');
    if (!cids) {
      this.logger.warn('NFTGO_SOLANA_AI_COLLECTIONS is not set');
      return [];
    }
    const collections = (await this.nftgo.getAICollections('solana', cids)).map(
      transformToAICollection,
    );
    this.logger.log(`Fetched ${collections.length} AI collections`);

    const bulkOperations = collections.map((coll) => ({
      updateOne: {
        filter: { id: coll.id },
        update: { $set: coll },
        upsert: true,
      },
    }));
    await this.mongo.collections.bulkWrite(bulkOperations);
    return collections;
  }

  async syncCollectionTxs(collectionId: string) {
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
          'solana',
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

  async syncCollectionNfts(collectionId: string) {
    const key = `collection-${collectionId}-nfts-progress`;
    let cursor = await this.mongo.getKeyStore(key);
    do {
      try {
        const result = await this.nftgo.getCollectionNfts(
          'solana',
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
            this.logger.warn(`this nft is not AI-NFT, nftId: ${transformedNft.nftId}`);
            continue;
          }
          transformedNft.agentId = stringToUuid(transformedNft.nftId);
          transformedNft.agentAccount = await this.elizaManager.getAgentAccount('solana', transformedNft.nftId);
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
        await this.mongo.nftActivities.updateOne({
          chain: activity.chain,
          txHash: activity.txHash,
          contractAddress: activity.contractAddress,
          tokenId: activity.tokenId,
          from: activity.from,
        }, { $set: activity }, { upsert: true, session });
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
