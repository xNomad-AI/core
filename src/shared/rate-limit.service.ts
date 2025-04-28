import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from './transient-logger.service.js';

/**
 * RateLimitService provides rate limiting functionality for API endpoints.
 * 
 * Features:
 * - In-memory rate limiting using a sliding window
 * - Configurable limits and time windows
 * - Per-user rate limiting
 * 
 * Configuration:
 * - RATE_LIMIT_DEFAULT_LIMIT: Maximum number of requests per window (default: 100)
 * - RATE_LIMIT_DEFAULT_WINDOW: Time window in seconds (default: 3600)
 * 
 * Usage:
 * ```typescript
 * // In a controller:
 * @Injectable()
 * export class MyController {
 *   constructor(private rateLimitService: RateLimitService) {}
 * 
 *   async myEndpoint(req: Request) {
 *     const userId = req.userId;
 *     const isAllowed = await this.rateLimitService.checkRateLimit(userId);
 *     if (!isAllowed) {
 *       throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
 *     }
 *     // Process request...
 *   }
 * }
 * ```
 * 
 * Note: This implementation uses in-memory storage and is not suitable for distributed systems.
 * For production use, consider using Redis or a similar distributed cache.
 */
@Injectable()
export class RateLimitService {
  private readonly rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly defaultLimit: number;
  private readonly defaultWindow: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: TransientLoggerService,
  ) {
    this.defaultLimit = this.configService.get<number>('RATE_LIMIT_DEFAULT_LIMIT') || 100;
    this.defaultWindow = this.configService.get<number>('RATE_LIMIT_DEFAULT_WINDOW') || 3600;
    this.logger.setContext('RateLimitService');
  }

  async checkRateLimit(key: string, limit?: number, window?: number): Promise<boolean> {
    const currentTime = Date.now();
    const rateLimit = this.rateLimits.get(key);
    const actualLimit = limit || this.defaultLimit;
    const actualWindow = window || this.defaultWindow;

    if (!rateLimit || currentTime > rateLimit.resetTime) {
      this.rateLimits.set(key, {
        count: 1,
        resetTime: currentTime + actualWindow * 1000,
      });
      return true;
    }

    if (rateLimit.count >= actualLimit) {
      this.logger.debug(`Rate limit exceeded for key: ${key}`);
      return false;
    }

    rateLimit.count++;
    return true;
  }

  async getRemainingLimit(key: string): Promise<number> {
    const rateLimit = this.rateLimits.get(key);
    if (!rateLimit) {
      return this.defaultLimit;
    }
    return Math.max(0, this.defaultLimit - rateLimit.count);
  }

  async getResetTime(key: string): Promise<number> {
    const rateLimit = this.rateLimits.get(key);
    if (!rateLimit) {
      return Date.now() + this.defaultWindow * 1000;
    }
    return rateLimit.resetTime;
  }
} 