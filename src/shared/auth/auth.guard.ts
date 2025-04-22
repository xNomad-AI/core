import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../transient-logger.service.js';

import { DISABLE_API_SERVER_AUTH } from '../../static-settings.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private logger: TransientLoggerService,
  ) {
    this.logger.setContext('AuthGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.debug('Processing authentication');
    const request = context.switchToHttp().getRequest();
    
    // if in local debug mode, return true
    if (DISABLE_API_SERVER_AUTH) {
      this.logger.warn('Authentication is disabled by DISABLE_API_SERVER_AUTH flag');
      return true;
    }

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      this.logger.error('No JWT token found in Authorization header');
      throw new UnauthorizedException('Missing authentication token');
    }

    try {

      this.logger.debug('Validating JWT token');
      const decoded = await this.jwtService.verifyAsync(token);
      this.logger.debug(`JWT token verified: ${JSON.stringify(decoded)}`);
      
      // Set values from JWT token on request object
      request['X-USER-ADDRESS'] = decoded.address;
      request['X-USER-CHAIN'] = decoded.chain;
      if (decoded.userId) request['userId'] = decoded.userId;
      if (decoded.roomId) request['roomId'] = decoded.roomId;
      if (decoded.agentId) request['agentId'] = decoded.agentId;
      
      this.logger.debug(`JWT values set on request: userId=${decoded.userId}, roomId=${decoded.roomId}, agentId=${decoded.agentId}`);
      
      return true;
    } catch(error) {
      this.logger.error(`JWT validation failed: ${error.message}`);
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired. Please recreate your auth token.');
      }
      throw new UnauthorizedException('Invalid token');
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
