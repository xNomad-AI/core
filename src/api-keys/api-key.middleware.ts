import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ApiKeyService } from './api-key.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(
    private apiKeyService: ApiKeyService,
    private jwtService: JwtService,
    private logger: TransientLoggerService,
  ) {
    this.logger.setContext('ApiKeyMiddleware');
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Only process if no Auth header but has API key
    if (!req.headers.authorization && req.headers['x-api-key']) {
      this.logger.debug('Found API key in headers, validating...');
      
      const apiKey = req.headers['x-api-key'] as string;
      const keyData = await this.apiKeyService.validateApiKey(apiKey);
      
      if (keyData) {
        this.logger.debug(`API key valid for user ${keyData.userId}`);
        
        // Generate minimal JWT token with chain, and address (similar to /login)
        const tokenPayload = {
          chain: keyData.chain,
          address: keyData.address
        };
        
        const token = this.jwtService.sign(tokenPayload);
        
        // Set Authorization header with the generated token
        req.headers.authorization = `Bearer ${token}`;
        
        this.logger.debug('API key converted to minimal JWT token');
      } else {
        this.logger.debug('Invalid API key');
      }
    }
    
    next();
  }
} 