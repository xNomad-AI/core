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

import { DISABLE_API_SERVER_AUTH } from '../../static-settings.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // if in local debug mode, return true
    if (DISABLE_API_SERVER_AUTH) {
      return true;
    }

    // Try API key first
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      try {
        const { userId, roomId, agentId } = await this.authService.validateApiKey(apiKey);
        request['userId'] = userId;
        request['roomId'] = roomId;
        request['agentId'] = agentId;
        return true;
      } catch (error) {
        throw new UnauthorizedException(error.message || 'Invalid or expired API key');
      }
    }

    // Fall back to JWT token
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing authentication');
    }

    try {
      const { chain, address } = await this.jwtService.verifyAsync(token);
      request['X-USER-ADDRESS'] = address;
      request['X-USER-CHAIN'] = chain;
    } catch(error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired. Please recreate your auth token.');
      }
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request['headers'].authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
