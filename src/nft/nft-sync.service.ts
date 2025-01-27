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

const SYNC_NFTS_INTERVAL = 1000 * 30;
const SYNC_TXS_INTERVAL = 1000 * 5;

@Injectable()
export class NftSyncService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly nftgo: NftgoService,
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
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
    // for (const collection of await this.getAICollections()) {
    //   // startIntervalTask('syncCollectionTxs', () =>
    //   //   this.syncCollectionTxs(collection.id), SYNC_TXS_INTERVAL)
    //   startIntervalTask('syncCollectionNfts', () =>
    //   this.syncCollectionNfts(collection.id), SYNC_NFTS_INTERVAL)
    // }
    const nft = `{
      "blockchain": "solana",
      "collection_name": "xNomad Genesis",
      "contract_type": "NonFungible",
      "contract_address": "7NY8QsaaKcmS6L9NFEGcTRHVUFJKsHzo5uUmWzqspkUa",
      "name": "xNomad #4058",
      "description": "xNomad Genesis NFT is the first truly autonomous experimental AI-NFT collection. For the first time, NFT owners can chat with their NFTs, ask for claiming airdrops, tweeting on their behalf, executing automated on-chain transactions, and more.",
      "image": "https://lh3.googleusercontent.com/6SRFvBujjzstVGgdf4Hw7QWl-fIymAIQShUZf9cSDAfDsCDwqoNC3Wri7jzgD54721OLN1f0aiLWstI6Mo8u_AUZ9fl3nOUlTn4=w0",
      "owner_addresses": [
        "32GF8NPokNVP2VGHfwb8cbgFStyf1zQBc9nZwFrzPGuN"
      ],
      "traits": [
        {
          "type": "category",
          "value": "image"
        }
      ],
      "rarity": {
        "score": 0.193,
        "rank": 845
      },
      "collection": {
        "last_updated": 1737913681,
        "collection_id": "d767895962f658681f490b3b7f9ff9de",
        "blockchain": "solana",
        "name": "xNomad Genesis",
        "description": "xNomad Genesis NFT is the first truly autonomous experimental AI-NFT collection based on ElizaOS(https://elizaos.ai/). For the first time, NFT owners can chat with their NFTs, ask for claiming airdrops, tweeting on their behalf, executing automated on-chain transactions, and more.",
        "official_website_url": "https://xnomad.ai/",
        "logo": "https://lh3.googleusercontent.com/4t1CNsP9H9Ly0fNwFdC5ZYOZmIEktsY62WV30hGfNiGeA4aOWVSUro6bkL7uD7cjniAC4oNoQ4ElDhKqGT1_K9kgYEoexc8oxA",
        "contracts": [],
        "contract_type": "NonFungible",
        "categories": [],
        "discord_url": "https://www.discord.gg/jeGQr69xx4",
        "twitter_url": "https://twitter.com/xNomadAI",
        "has_rarity": false,
        "is_blue_chip_coll": false,
        "total_supply": 5000,
        "is_spam": false,
        "floor_price": {
          "value": 1.031208717,
          "raw_value": 1031208717,
          "usd": 263.61,
          "payment_token": {
            "address": "",
            "symbol": "SOL",
            "decimals": 9
          }
        }
      },
      "created": {
        "minted_to": "32GF8NPokNVP2VGHfwb8cbgFStyf1zQBc9nZwFrzPGuN",
        "quantity": 1,
        "timestamp": 1737705188,
        "block_number": 316020295,
        "transaction": "2tG8EyE9wLzqTGYNjwaKz3y3AcQJhLyDHYiDcYbewDGHJ3rcwNVgnpwURR9cWsWX2HvxGbVyihQtoVvMs6R119K"
      },
      "extra_info": {
        "creators": [],
        "metadata_original_url": "https://static.xnomad.ai/metadata/4058.json",
        "image_original_url": "https://bafybeicboqex454scrvw7lfw4v2ikhkv7whuwvu6h5wbn7iyf2vk7uwfkm.ipfs.w3s.link/unrevealed.gif"
      }
    }`
    const transformedNft = await transformToAINft(JSON.parse(nft));
    await this.mongo.nfts.updateOne({
      id: transformedNft.nftId
    }, {
      $set: transformedNft
    }, {
      upsert: true
    })
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
            limit: 20,
            cursor,
          }
        );
        this.logger.log(
          `Fetched ${result?.nfts.length} nfts for collection: ${collectionId}`,
        );
        const nfts = [];
        for (const nft of result.nfts) {
          const transformedNft = await transformToAINft(nft);
          if (!transformedNft.aiAgent){
            this.logger.error(`this collection is not AI-NFT: ${collectionId}`);
            return
          }
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
        await this.mongo.updateKeyStore(key, result.next_cursor);
        // this.eventEmitter.emit(NEW_AI_NFT_EVENT, nfts);
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
        await this.mongo.nftActivities.insertOne(activity, { session });
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
      await this.mongo.updateKeyStore(key, txs.next_cursor, session);
    });
    await session.endSession();
  }
}
