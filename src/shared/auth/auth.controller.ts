import { Body, Controller, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/api-key')
  @UseGuards(AuthGuard)
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