import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TransientLoggerService } from '../transient-logger.service.js';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private logger: TransientLoggerService
  ) {
    this.logger.setContext('AuthService');
  }

  getAccessToken(payload: {
    chain: string;
    address: string;
    userId?: string;
    roomId?: string;
    agentId?: string;
  }): { accessToken: string } {
    this.logger.debug(`Generating access token for payload: ${JSON.stringify(payload)}`);
    
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: '2d',
      }),
    };
  }
}
