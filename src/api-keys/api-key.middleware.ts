import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ApiKeyService } from './api-key.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { extractTokenFromHeader, isJwtToken } from '../shared/utils/auth.utils.js';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(
    private apiKeyService: ApiKeyService,
    private jwtService: JwtService,
    private logger: TransientLoggerService,
  ) {
    this.logger.setContext('ApiKeyMiddleware');
  }

  // Quick sanity check for API key format based on our generation method
  private isApiKeyFormatValid(token: string): boolean {
    // We generate API keys as 32 bytes hex strings
    return token && token.length === 64 && /^[0-9a-f]+$/i.test(token);
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Only process requests with Authorization header
    if (req.headers.authorization) {
      const token = extractTokenFromHeader(req);
      
      // If token exists and doesn't look like a JWT, treat it as an API key
      if (token && !isJwtToken(token)) {
        if (!this.isApiKeyFormatValid(token)) {
          this.logger.warn(`Invalid API key format detected: ${token.substring(0, 6)}...`);
          next();
          return;
        }
        
        this.logger.debug('Found API key in Authorization header, validating...');
        const keyData = await this.apiKeyService.validateApiKey(token);
        
        if (keyData) {
          this.logger.debug(`API key valid for user ${keyData.userId}`);
          
          req['hasApiKey'] = true;
          req['apiKey'] = token;
          
          // Generate minimal JWT token
          const tokenPayload = {
            chain: keyData.chain,
            address: keyData.address
          };
          
          const jwtToken = this.jwtService.sign(tokenPayload);
          
          // Replace the Authorization header with the JWT
          req.headers.authorization = `Bearer ${jwtToken}`;
          
          this.logger.debug('API key converted to minimal JWT token');
        } else {
          this.logger.debug('Invalid API key in Authorization header');
        }
      }
      // If it's a JWT token, nothing to do, it will be validated by AuthGuard
    }
    
    next();
  }
} 