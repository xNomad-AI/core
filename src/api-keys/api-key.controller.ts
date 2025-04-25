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
import { NftService } from '../nft/nft.service.js';
import { stringToUuid } from '../utils/string-to-uuid.js';

@Controller('api-keys')
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly nftService: NftService,
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
      nftId: string,
    },
  ) {
    // Get authenticated user's address from JWT token
    const authenticatedAddress = req['X-USER-ADDRESS'];
    const authenticatedChain = req['X-USER-CHAIN'];
    
    // Validate NFT ownership using nftService
    const isAdmin = await this.nftService.isNftAdmin(
      authenticatedChain, 
      authenticatedAddress, 
      createDto.nftId
    );
    
    if (!isAdmin) {
      this.logger.error(`Security violation: Address ${authenticatedAddress} attempted to use NFT ${createDto.nftId} they don't own`);
      throw new UnauthorizedException('You can only use NFTs that you own');
    }
    
    // Get NFT data to extract agentId
    const nft = await this.nftService.getNftById(authenticatedChain, createDto.nftId);
    
    // Generate userId from NFT ID
    const userId = stringToUuid(createDto.nftId);
    const roomId = userId; // Set roomId equal to userId
    const agentId = nft.agentId;

    this.logger.debug(`Creating API key for NFT ${createDto.nftId} with userId ${userId}`);
    
    const key = await this.apiKeyService.createApiKey(
      userId,
      createDto.name,
      createDto.expirationDays,
      roomId,
      agentId,
      authenticatedChain,
      authenticatedAddress
    );
    
    this.logger.debug(`Successfully created API key for NFT ${createDto.nftId}`);
    return { key };
  }

  @Get()
  @UseGuards(AuthGuard)
  async listApiKeys(@Request() req, @Query('userId') userId?: string) {
    // Get authenticated user's address from JWT token
    const authenticatedAddress = req['X-USER-ADDRESS'];
    
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