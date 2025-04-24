import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  Query,
  UnauthorizedException,
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
    },
  ) {

    // Get authenticated user's address from JWT token
    const authenticatedAddress = req['X-USER-ADDRESS'];
    const authenticatedChain = req['X-USER-CHAIN'];
    if (!authenticatedAddress) {
      this.logger.error('Failed to create API key: No authenticated user found');
      throw new UnauthorizedException('Authentication required to create API keys');
    }
    
    // Get the userId associated with the authenticated address
    const requestedUserId = createDto.userId;
    if (!requestedUserId) {
      this.logger.error('Failed to create API key: User ID not provided');
      throw new Error('User ID is required to create an API key');
    }
    
    // Verify ownership: Check if the requestedUserId belongs to the authenticated address, and if the agentId is owned by the user
    const userInfo = await this.apiKeyService.getUserInfo(requestedUserId);
    if (!userInfo || userInfo.address !== authenticatedAddress) {
      this.logger.error(`Security violation: Address ${authenticatedAddress} attempted to create API key for userId ${requestedUserId} they don't own`);
      throw new UnauthorizedException('You can only create API keys for your own user account');
    }
    
    if (createDto.agentId && userInfo.agentId !== createDto.agentId) {
      this.logger.error(`Security violation: User ${requestedUserId} attempted to use unauthorized agentId ${createDto.agentId}`);
      throw new UnauthorizedException('You can only use agents that belong to your account');
    }
    
    this.logger.debug(`Creating API key for validated user ${requestedUserId}`);
    
    const key = await this.apiKeyService.createApiKey(
      requestedUserId,
      createDto.name,
      createDto.expirationDays,
      createDto.roomId,
      createDto.agentId,
      authenticatedChain,
      authenticatedAddress
    );
    
    this.logger.debug(`Successfully created API key for user ${requestedUserId}`);
    return { key };
  }

  @Get()
  @UseGuards(AuthGuard)
  async listApiKeys(@Request() req, @Query('userId') userId?: string) {

    if (!userId) {
      this.logger.error('Failed to list API keys: User ID not found');
      throw new Error('User ID is required to list API keys');
    }
    
    this.logger.debug(`Listing API keys for user ${userId}`);
    const keys = await this.apiKeyService.listApiKeys(userId);
    return { keys };
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async revokeApiKey(
    @Param('id') id: string, 
    @Request() req,
    @Query('userId') userId?: string
  ) {
    if (!userId) {
      this.logger.error('Failed to revoke API key: User ID not found');
      throw new Error('User ID is required to revoke an API key');
    }
    
    this.logger.debug(`Revoking API key ${id} for user ${userId}`);
    const success = await this.apiKeyService.revokeApiKey(id, userId);
    return { success };
  }

  @Delete(':id/permanent')
  @UseGuards(AuthGuard)
  async deleteApiKey(
    @Param('id') id: string, 
    @Request() req,
    @Query('userId') userId?: string
  ) {
    if (!userId) {
      this.logger.error('Failed to delete API key: User ID not found');
      throw new Error('User ID is required to delete an API key');
    }
    
    this.logger.debug(`Permanently deleting API key ${id} for user ${userId}`);
    const success = await this.apiKeyService.deleteApiKey(id, userId);
    return { success };
  }
} 