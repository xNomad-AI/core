import { Injectable, OnModuleInit } from '@nestjs/common';
import { Collection, Document, MongoClient } from 'mongodb';
import { TransientLoggerService } from '../transient-logger.service.js';
import { COLLECTIONS } from './configs.js';
import {
  CollectionName,
  AICollection,
  AINft,
  AINftOwner,
  AINftActivity,
  KeyStore,
  AddressNonce,
} from './types.js';
import { ConfigService } from '@nestjs/config';
import { UtilsService } from '../utils.service.js';

@Injectable()
export class MongoService implements OnModuleInit {
  client: MongoClient;
  constructor(
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
  ) {
    logger.setContext(MongoService.name);
  }

  onModuleInit() {
    const source = `${this.appConfig.get('MONGODB_URL')}`;
    const maskedSource = `${source.slice(0, 10)}*****${source.slice(-15)}`;
    this.client = new MongoClient(source);
    this.logger.log(`Initialized mongo: ${maskedSource}`);
    void this.ensureIndexes();
  }

  private async ensureIndexes() {
    const startTime = Date.now();
    const settled = await Promise.allSettled(
      COLLECTIONS.map(async ({ db, name, indexes, uniqueIndexes }) => {
        const collection = this.client.db(db).collection(name);
        if (indexes.length > 0) {
          await Promise.all(
            indexes.map((index: Record<string, number>) =>
              collection.createIndex(index, {}),
            ),
          );
        }

        if (uniqueIndexes.length > 0) {
          await Promise.all(
            uniqueIndexes.map((index: Record<string, number>) =>
              collection.createIndex(index, { unique: true }),
            ),
          );
        }
      }),
    );

    const rejected = settled
      .map((result, index) => {
        if (!UtilsService.IsRejected(result)) {
          return;
        }

        return {
          collection: COLLECTIONS[index].name,
          reason: result.reason,
        };
      })
      .filter(Boolean);

    if (rejected.length > 0) {
      this.logger.error('Failed to create indexes: ', JSON.stringify(rejected));
    }

    this.logger.debug(
      `Ensure indexes completed. time used: ${(Date.now() - startTime) / 1e3}s`,
    );
  }

  private getCollection<T extends Document>(
    name: CollectionName,
  ): Collection<T> {
    const collection = COLLECTIONS.find((item) => item.name === name);

    if (!collection) {
      throw new Error(`Collection ${name} not found`);
    }

    return this.client.db(collection.db).collection<T>(collection.name);
  }

  get collections() {
    return this.getCollection<AICollection>('collections');
  }

  get nfts() {
    return this.getCollection<AINft>('nfts');
  }

  get nftOwners() {
    return this.getCollection<AINftOwner>('nftOwners');
  }

  get nftActivities() {
    return this.getCollection<AINftActivity>('nftActivities');
  }

  get addressNonces() {
    return this.getCollection<AddressNonce>('addressNonces');
  }

  // global key-value storage
  private get keyStore() {
    return this.getCollection<KeyStore>('keyStore');
  }

  async updateKeyStore<T>(key: string, value: T, session?) {
    await this.keyStore.updateOne(
      { key },
      { $set: { value } },
      { upsert: true, session },
    );
  }

  async getKeyStore(key: string, session?) {
    const result = await this.keyStore.findOne({ key }, { session });
    return result?.value;
  }
}
