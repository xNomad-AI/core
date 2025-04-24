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

  async use(req: Request, res: Response, next: NextFunction) {
    // Only process requests with Authorization header
    if (req.headers.authorization) {
      const token = extractTokenFromHeader(req);
      
      // If token exists and doesn't look like a JWT, treat it as an API key
      if (token && !isJwtToken(token)) {
        this.logger.debug('Found API key in Authorization header, validating...');
        const keyData = await this.apiKeyService.validateApiKey(token);
        
        if (keyData) {
          this.logger.debug(`API key valid for user ${keyData.userId}`);
          
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