import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ApiKey } from '../shared/mongo/types.js';
import { ObjectId } from 'mongodb';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyService {
  private DEFAULT_API_KEY_EXPIRATION_DAYS = 30;

  constructor(
    private mongoService: MongoService,
    private logger: TransientLoggerService,
    private configService: ConfigService,
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
    customExpirationDays?: number,
    roomId?: string,
    agentId?: string,
    chain?: string,
    address?: string,
  ): Promise<string> {
    if (!userId) {
      this.logger.error('Cannot create API key: userId is required');
      throw new Error('User ID is required to create an API key');
    }

    const key = this.generateSecureKey();
    const hashedKey = this.hashKey(key);
 
    // Get max expiration days from config or use default
    const maxExpirationDays = this.configService.get<number>('API_KEY_EXPIRATION_DAYS') 
      || this.DEFAULT_API_KEY_EXPIRATION_DAYS;
    

    if (customExpirationDays && customExpirationDays > 0 && customExpirationDays > maxExpirationDays) {
      throw new Error(`Custom expiration days ${customExpirationDays} exceeds max ${maxExpirationDays}`);
    }
    
    // Set expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + customExpirationDays);

    // Store minimal data in API key record
    await this.apiKeysCollection.insertOne({
      key: hashedKey,
      userId,
      chain,
      address,
      roomId,
      agentId,
      name,
      createdAt: new Date(),
      expiresAt,
      active: true,
    });

    this.logger.debug(`Created API key for user ${userId} with roomId ${roomId} and agentId ${agentId}`);
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

  /**
   * Delete an API key
   */
  async deleteApiKey(apiKeyId: string, userId: string): Promise<boolean> {
    const result = await this.apiKeysCollection.deleteOne({
      _id: new ObjectId(apiKeyId),
      userId
    });

    const success = result.deletedCount > 0;
    if (success) {
      this.logger.debug(`API key ${apiKeyId} permanently deleted for user ${userId}`);
    } else {
      this.logger.debug(`Failed to delete API key ${apiKeyId} for user ${userId}`);
    }
    
    return success;
  }

} 