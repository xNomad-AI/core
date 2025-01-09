import { Injectable, OnModuleInit } from '@nestjs/common';
import { Collection, MongoClient } from 'mongodb';
import { TransientLoggerService } from '../transient-logger.service.js';
import { COLLECTIONS } from './configs.js';
import { CollectionName, AICollection, AINft } from './types.js';
import { ConfigService } from '@nestjs/config';

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
    const source = `${this.appConfig.get('MONGO')}`;
    const maskedSource = `${source.slice(0, 10)}*****${source.slice(-15)}`;
    this.client = new MongoClient(source);
    this.logger.log(`Initialized mongo: ${maskedSource}`);
    void this.ensureIndexes();
  }

  private async ensureIndexes() {
    // TODO
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
}
