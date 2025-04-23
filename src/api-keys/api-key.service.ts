import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ApiKey } from '../shared/mongo/types.js';
import { ObjectId } from 'mongodb';

@Injectable()
export class ApiKeyService {
  constructor(
    private mongoService: MongoService,
    private logger: TransientLoggerService,
  ) {
    this.logger.setContext('ApiKeyService');
  }

  private get apiKeysCollection() {
    return this.mongoService.client.db('core').collection<ApiKey>('apiKeys');
  }

  /**
   * Generate a secure API key
   */
  private generateSecureKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash an API key for secure storage
   */
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Get all user information from MongoDB
   */
  async getUserInfo(userId: string) {
    // Get user data from memories collection
    const memory = await this.mongoService.client
      .db('agent')
      .collection('memories')
      .findOne(
        { userId },
        { sort: { createdAt: -1 } }
      );
    
    return {
      userId,
      chain: memory?.chain,
      address: memory?.address,
      roomId: memory?.roomId,
      agentId: memory?.agentId
    };
  }

  /**
   * Create a new API key for a user
   */
  async createApiKey(
    userId: string,
    name: string,
  ): Promise<string> {
    const key = this.generateSecureKey();
    const hashedKey = this.hashKey(key);
    
    // Get user data
    const userInfo = await this.getUserInfo(userId);
    
    // Set expiration (90 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    // Store minimal data in API key record
    await this.apiKeysCollection.insertOne({
      key: hashedKey,
      userId,
      chain: userInfo.chain,
      address: userInfo.address,
      name,
      createdAt: new Date(),
      expiresAt,
      active: true,
    });

    this.logger.debug(`Created API key for user ${userId}`);
    return key;
  }

  /**
   * Validate an API key
   */
  async validateApiKey(key: string): Promise<ApiKey | null> {
    const hashedKey = this.hashKey(key);
    
    const apiKey = await this.apiKeysCollection.findOne({
      key: hashedKey,
      active: true,
      expiresAt: { $gt: new Date() },
    });

    if (apiKey) {
      // Update last used timestamp
      await this.apiKeysCollection.updateOne(
        { _id: apiKey._id },
        { $set: { lastUsed: new Date() } },
      );
      
      this.logger.debug(`API key validated for user ${apiKey.userId}`);
      return apiKey;
    }

    this.logger.debug('Invalid or expired API key');
    return null;
  }

  /**
   * Get all API keys for a user
   */
  async listApiKeys(userId: string): Promise<Omit<ApiKey, 'key'>[]> {
    const apiKeys = await this.apiKeysCollection
      .find({ userId, active: true })
      .toArray();

    // Don't return the hashed key to the client
    return apiKeys.map(({ key, ...rest }) => rest);
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(apiKeyId: string, userId: string): Promise<boolean> {
    const result = await this.apiKeysCollection.updateOne(
      { _id: new ObjectId(apiKeyId), userId },
      { $set: { active: false } },
    );

    const success = result.modifiedCount > 0;
    if (success) {
      this.logger.debug(`API key ${apiKeyId} revoked for user ${userId}`);
    } else {
      this.logger.debug(`Failed to revoke API key ${apiKeyId} for user ${userId}`);
    }
    
    return success;
  }

} 