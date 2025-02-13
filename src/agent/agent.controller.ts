import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { CreateAgentDto } from './agent.types.js';
import { ElizaManagerService } from './eliza-manager.service.js';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { CacheTTL } from '@nestjs/cache-manager';
import { ElevenlabsService } from '../shared/elevenlabs.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NEW_AI_NFT_EVENT } from '../nft/nft.types.js';

@Controller('/agent')
export class AgentController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly elevenlabs: ElevenlabsService,
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
    private mongo: MongoService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('/')
  async startNFTAgent(@Body() { nftId, restart }: CreateAgentDto) {
    const nft = await this.mongo.nfts.findOne({
      nftId,
    });
    if (!nft) {
      throw new NotFoundException('NFT not found');
    }
    await this.eventEmitter.emit(NEW_AI_NFT_EVENT, [nft], restart);
  }

  @Get('/status')
  async getAgentStatus(@Query('agentId') agentId: string) {
    return this.elizaManager.getAgentStatus(agentId);
  }

  @Get('/checkTee')
  async checkTee() {
    return await this.elizaManager.checkTee();
  }

  @Delete('/memory')
  async deleteAgentMemory(
    @Query('agentId') agentId: string,
    @Query('roomId') roomId: string,
    @Query('userId') userId: string,
  ) {
    await this.elizaManager.deleteAgentMemory(agentId, { roomId, userId });
  }

  @Get('/account')
  async getNftAccount(
    @Query('chain') chain: string,
    @Query('nftId') nftId: string,
    @Query('agentId') agentId: string,
  ) {
    const account = await this.elizaManager.getAgentAccount(
      chain,
      nftId,
      agentId,
    );
    return {
      account,
    };
  }

  @Get('/voices')
  @CacheTTL(3600)
  async getVoices() {
    return await this.elevenlabs.getVoices();
  }

  @Get('/prologue')
  async getNftPrologue(
    @Query('chain') chain: string,
    @Query('nftId') nftId: string,
  ) {
    const prologue = await this.mongo.nftPrologues.findOne({
      chain,
      nftId,
    });
    if (!prologue) {
      throw new NotFoundException('Prologue not found');
    }
    return {
      prologue: prologue.prologue,
    };
  }
}
