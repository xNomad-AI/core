import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { TransientLoggerService } from '../transient-logger.service.js';

import { DISABLE_API_SERVER_AUTH } from '../../static-settings.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private authService: AuthService,
    private logger: TransientLoggerService,
  ) {
    this.logger.setContext('AuthGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.debug('Processing authentication');
    const request = context.switchToHttp().getRequest();
    
    this.logger.debug(`Headers: ${JSON.stringify(request.headers)}`);
    this.logger.debug(`Auth disabled: ${DISABLE_API_SERVER_AUTH}`);
    
    // if in local debug mode, return true
    if (DISABLE_API_SERVER_AUTH) {
      this.logger.warn('Authentication is disabled by DISABLE_API_SERVER_AUTH flag');
      return true;
    }

    // Try API key first
    const apiKey = request.headers['x-api-key'];
    this.logger.debug(`Found API key in header: ${!!apiKey}`);
    
    if (apiKey) {
      try {
        this.logger.debug(`Validating API key: ${apiKey}`);
        const { userId, roomId, agentId } = await this.authService.validateApiKey(apiKey);
        
        this.logger.debug(`API key validated successfully: userId=${userId}, roomId=${roomId}, agentId=${agentId}`);
        
        request['userId'] = userId;
        request['roomId'] = roomId;
        request['agentId'] = agentId;
        
        return true;
      } catch (error) {
        this.logger.error(`API key validation failed: ${error.message}`);
        throw new UnauthorizedException(error.message || 'Invalid or expired API key');
      }
    }

    // Fall back to JWT token
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      this.logger.error('No API key or JWT token found');
      throw new UnauthorizedException('Missing authentication');
    }

    try {
      this.logger.debug('Validating JWT token');
      const decoded = await this.jwtService.verifyAsync(token);
      this.logger.debug(`JWT token verified: ${JSON.stringify(decoded)}`);
      
      request['X-USER-ADDRESS'] = decoded.address;
      request['X-USER-CHAIN'] = decoded.chain;
      
      return true;
    } catch(error) {
      this.logger.error(`JWT validation failed: ${error.message}`);
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired. Please recreate your auth token.');
      }
      throw new UnauthorizedException();
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    this.logger.debug(`Authorization header: ${authHeader}`);
    
    if (!authHeader) {
      return undefined;
    }
    
    const [type, token] = authHeader.split(' ');
    this.logger.debug(`Auth type: ${type}`);
    return type === 'Bearer' ? token : undefined;
  }
}
