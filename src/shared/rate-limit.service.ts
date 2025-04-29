import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from './transient-logger.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';

type RateLimitKey = string;

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

/**
 * RateLimitService provides rate limiting functionality for API endpoints.
 * 
 * Features:
 * - In-memory rate limiting using a sliding window
 * - Automatic cleanup of expired rate limits
 * - Configurable limits and time windows
 * - Per-user rate limiting
 * 
 * Configuration:
 * - RATE_LIMIT_DEFAULT_LIMIT: Maximum number of requests per window (default: 600)
 * - RATE_LIMIT_DEFAULT_WINDOW: Time window in seconds (default: 3600)
 */
@Injectable()
export class RateLimitService {
  private readonly rateLimits: Map<RateLimitKey, RateLimitInfo> = new Map();
  
  // Configuration constants
  private readonly DEFAULT_REQUESTS_PER_WINDOW = 600;  // Default requests allowed per window
  private readonly DEFAULT_WINDOW_SECONDS = 3600;      // Default window size (1 hour)
  private readonly defaultLimit: number;
  private readonly defaultWindow: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: TransientLoggerService,
  ) {
    this.defaultLimit = this.configService.get<number>('RATE_LIMIT_DEFAULT_LIMIT') || this.DEFAULT_REQUESTS_PER_WINDOW;
    this.defaultWindow = this.configService.get<number>('RATE_LIMIT_DEFAULT_WINDOW') || this.DEFAULT_WINDOW_SECONDS;
    this.logger.setContext('RateLimitService');
    this.logger.debug(`Rate limit service initialized with limit: ${this.defaultLimit} requests per ${this.defaultWindow}s window`);
  }

  /**
   * Check if a request is allowed based on rate limits
   * @param key - Unique identifier for the rate limit (e.g., user ID)
   * @param limit - Optional custom limit for this check
   * @param window - Optional custom time window for this check
   * @returns true if the request is allowed, false if rate limit exceeded
   */
  async checkRateLimit(key: RateLimitKey, limit?: number, window?: number): Promise<boolean> {
    this.logger.debug(`Checking rate limit for key: ${key}`);
    
    const currentTime = Date.now();
    let rateLimit = this.rateLimits.get(key);
    const actualLimit = limit || this.defaultLimit;
    const actualWindow = window || this.defaultWindow;

    if (!rateLimit || currentTime > rateLimit.resetTime) {
      this.logger.debug(`Creating new rate limit for key: ${key}`);
      rateLimit = {
        count: 1,
        resetTime: currentTime + actualWindow * 1000,
      };
      this.rateLimits.set(key, rateLimit);
      return true;
    }

    if (rateLimit.count >= actualLimit) {
      this.logger.debug(`Rate limit exceeded for key: ${key}, count: ${rateLimit.count}, limit: ${actualLimit}`);
      return false;
    }

    rateLimit.count++;
    this.logger.debug(`Rate limit updated for key: ${key}, count: ${rateLimit.count}`);
    return true;
  }

  /**
   * Get the remaining number of allowed requests for a key
   * @param key - Unique identifier for the rate limit
   * @returns Number of remaining allowed requests
   */
  async getRemainingLimit(key: RateLimitKey): Promise<number> {
    const rateLimit = this.rateLimits.get(key);
    if (!rateLimit) {
      return this.defaultLimit;
    }
    const remaining = Math.max(0, this.defaultLimit - rateLimit.count);
    this.logger.debug(`Remaining limit for key: ${key}: ${remaining}`);
    return remaining;
  }

  /**
   * Get the time when the rate limit will reset for a key
   * @param key - Unique identifier for the rate limit
   * @returns Timestamp when the rate limit will reset
   */
  async getResetTime(key: RateLimitKey): Promise<number> {
    const rateLimit = this.rateLimits.get(key);
    if (!rateLimit) {
      return Date.now() + this.defaultWindow * 1000;
    }
    this.logger.debug(`Reset time for key: ${key}: ${new Date(rateLimit.resetTime).toISOString()}`);
    return rateLimit.resetTime;
  }

  /**
   * Clean up expired rate limits
   * Runs every hour to prevent memory leaks
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldRateLimits() {
    const currentTime = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of this.rateLimits.entries()) {
      if (currentTime > value.resetTime) {
        this.rateLimits.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired rate limits`);
    }
  }
} 