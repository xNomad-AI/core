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
  ForbiddenException,
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

  // Validate that the authenticated user owns the userId and specified resources
  private async validateUserOwnership(
    authenticatedAddress: string, 
    userId: string,
    resourceId?: { agentId?: string }
  ) {
    if (!authenticatedAddress) {
      this.logger.error('Security violation: No authenticated address found');
      throw new UnauthorizedException('Authentication required');
    }

    if (!userId) {
      this.logger.error('Security violation: No userId provided');
      throw new UnauthorizedException('User ID is required');
    }

    // Verify user ownership
    const userInfo = await this.apiKeyService.getUserInfo(userId);
    
    if (!userInfo || userInfo.address !== authenticatedAddress) {
      this.logger.error(`Security violation: Address ${authenticatedAddress} attempted to access userId ${userId} they don't own`);
      throw new UnauthorizedException('You can only access your own account resources');
    }

    // Verify resource ownership if specified
    if (resourceId?.agentId && userInfo.agentId !== resourceId.agentId) {
      this.logger.error(`Security violation: User ${userId} attempted to use unauthorized agentId ${resourceId.agentId}`);
      throw new ForbiddenException('You can only use agents that belong to your account');
    }

    return userInfo;
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
    
    // Validate user ownership and resources
    const userInfo = await this.validateUserOwnership(
      authenticatedAddress,
      createDto.userId,
      { agentId: createDto.agentId }
    );
    
    this.logger.debug(`Creating API key for validated user ${createDto.userId}`);
    
    const key = await this.apiKeyService.createApiKey(
      createDto.userId,
      createDto.name,
      createDto.expirationDays,
      createDto.roomId ,
      createDto.agentId,
      authenticatedChain,
      authenticatedAddress
    );
    
    this.logger.debug(`Successfully created API key for user ${createDto.userId}`);
    return { key };
  }

  @Get()
  @UseGuards(AuthGuard)
  async listApiKeys(@Request() req, @Query('userId') userId?: string) {
    // Get authenticated user's address from JWT token
    const authenticatedAddress = req['X-USER-ADDRESS'];
    
    // Validate user ownership
    await this.validateUserOwnership(authenticatedAddress, userId);
    
    this.logger.debug(`Listing API keys for validated user ${userId}`);
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
    // Get authenticated user's address from JWT token
    const authenticatedAddress = req['X-USER-ADDRESS'];
    
    // Validate user ownership
    await this.validateUserOwnership(authenticatedAddress, userId);
    
    // Additional validation: verify the API key belongs to this user
    const apiKey = await this.apiKeyService.getApiKeyById(id);
    if (!apiKey) {
      throw new UnauthorizedException('API key not found');
    }
    
    if (apiKey.userId !== userId) {
      this.logger.error(`Security violation: User ${userId} attempted to revoke API key ${id} belonging to another user`);
      throw new ForbiddenException('You can only revoke your own API keys');
    }
    
    this.logger.debug(`Revoking API key ${id} for validated user ${userId}`);
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
    // Get authenticated user's address from JWT token
    const authenticatedAddress = req['X-USER-ADDRESS'];
    
    // Validate user ownership
    await this.validateUserOwnership(authenticatedAddress, userId);
    
    // Additional validation: verify the API key belongs to this user
    const apiKey = await this.apiKeyService.getApiKeyById(id);
    if (!apiKey) {
      throw new UnauthorizedException('API key not found');
    }
    
    if (apiKey.userId !== userId) {
      this.logger.error(`Security violation: User ${userId} attempted to delete API key ${id} belonging to another user`);
      throw new ForbiddenException('You can only delete your own API keys');
    }
    
    this.logger.debug(`Permanently deleting API key ${id} for validated user ${userId}`);
    const success = await this.apiKeyService.deleteApiKey(id, userId);
    return { success };
  }
} 