import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Controller('api-keys')
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private logger: TransientLoggerService,
  ) {
    this.logger.setContext('ApiKeyController');
  }

  @Post()
  @UseGuards(AuthGuard)
  async createApiKey(
    @Request() req,
    @Body() createDto: { 
      name: string, 
      expirationDays?: number, 
      userId?: string,
      roomId?: string,
      agentId?: string,
      chain?: string,
      address?: string,
    },
  ) {
    // Use userId from request if not provided in body
    const userId = createDto.userId || req['userId'] || req['X-USER-ADDRESS'];
    
    if (!userId) {
      this.logger.error('Failed to create API key: User ID not found in request or body');
      throw new Error('User ID is required to create an API key');
    }
    
    this.logger.debug(`Creating API key for user ${userId}`);
    
    const key = await this.apiKeyService.createApiKey(
      userId,
      createDto.name,
      createDto.expirationDays,
      createDto.roomId,
      createDto.agentId,
      createDto.chain,
      createDto.address
    );
    
    return { key };
  }

  @Get()
  @UseGuards(AuthGuard)
  async listApiKeys(@Request() req) {
    this.logger.debug(`Listing API keys for user ${req['userId']}`);
    const keys = await this.apiKeyService.listApiKeys(req['userId']);
    return { keys };
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async revokeApiKey(@Param('id') id: string, @Request() req) {
    this.logger.debug(`Revoking API key ${id} for user ${req['userId']}`);
    const success = await this.apiKeyService.revokeApiKey(id, req['userId']);
    return { success };
  }
} 