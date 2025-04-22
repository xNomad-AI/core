import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/api-key')
  async createAPIKey(
    @Body()
    {
      userId,
      roomId,
      agentId,
    }: {
      userId: string;
      roomId: string;
      agentId: string;
    },
  ) {
    if (!userId || !roomId || !agentId) {
      throw new UnauthorizedException('Missing required parameters');
    }
    
    const result = await this.authService.createAndStoreAPIKey(userId, roomId, agentId);
    
    return {
      token: result.token,
      apiKey: result.apiKey
    };
  }
} 