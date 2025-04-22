import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/session/configure')
  @UseGuards(AuthGuard)
  async configureSession(
    @Request() req,
    @Body() { userId, roomId, agentId }: { userId: string; roomId: string; agentId: string }
  ) {
    const payload = { 
      chain: req['X-USER-CHAIN'], 
      address: req['X-USER-ADDRESS'],
      userId, 
      roomId, 
      agentId 
    };
    
    const { accessToken } = this.authService.getAccessToken(payload);
    return { accessToken };
  }
} 