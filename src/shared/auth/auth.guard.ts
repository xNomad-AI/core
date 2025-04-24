import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { extractTokenFromHeader } from '../utils/auth.utils.js';

import { DISABLE_API_SERVER_AUTH } from '../../static-settings.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractTokenFromHeader(request);

    // if in local debug mode, return true
    if (DISABLE_API_SERVER_AUTH) {
      return true;
    }

    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const { chain, address } = await this.jwtService.verifyAsync(token);
      request['X-USER-ADDRESS'] = address;
      request['X-USER-CHAIN'] = chain;
    } catch(error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired');
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
