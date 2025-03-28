import { CacheTTL } from '@nestjs/cache-manager';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NEW_AI_NFT_EVENT } from '../nft/nft.types.js';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { ElevenlabsService } from '../shared/elevenlabs.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { CreateAgentDto, SolanaTradeSettingsDTO, EvmTradeSettingsDTO, validateTradeSettingsSolana, validateTradeSettingsEvm } from './agent.types.js';
import { ElizaManagerService } from './eliza-manager.service.js';
import { CopyTrade } from '../shared/mongo/types.js';
import { AgentTradeService } from './agent-trade.service.js';

@Controller('/agent')
export class AgentController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly elevenlabs: ElevenlabsService,
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
    private mongo: MongoService,
    private readonly tradeService: AgentTradeService,
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

  @Delete('/memory')
  async deleteAgentMemory(
    @Query('agentId') agentId: string,
    @Query('roomId') roomId: string,
    @Query('userId') userId: string,
  ) {
    await this.elizaManager.deleteAgentMemory(agentId, { roomId });
  }

  @UseGuards(AuthGuard)
  @Get('/autotasks')
  async getAgentAutotask(
    @Query('agentId') agentId: string,
    @Request() request,
  ) {
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    return await this.tradeService.getAgentAutotasks(agentId);
  }

  @UseGuards(AuthGuard)
  @Delete('/autotask')
  async deleteAgentAutotask(
    @Query('agentId') agentId: string,
    @Query('taskId') taskId: string,
    @Request() request,
  ) {
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    await this.elizaManager.deleteAgentMemory(agentId, {
      memoryId: taskId,
    });
  }

  @Get('/trade/settings')
  async getTradeSettings(
    @Request() request,
    @Query('chain') chain: string = 'solana',
    @Query('agentId') agentId: string,
  ) {
    return await this.tradeService.getTradeSettingsByChain(agentId, chain);
  }

  @UseGuards(AuthGuard)
  @Post('/trade/settings')
  async updateSolanaTradeSettings(
    @Request() request,
    @Query('chain') chain: string = 'solana',
    @Query('agentId') agentId: string,
    @Body() tradeSettingsDTO: SolanaTradeSettingsDTO
  ) {
    validateTradeSettingsSolana(tradeSettingsDTO);
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    const { nftId } = await this.mongo.nfts.findOne({ agentId });

    await this.mongo.nftConfigs.updateOne(
      { nftId },
      {
        $set: {
          [`tradeSettings.${chain}`]: tradeSettingsDTO,
        },
        $setOnInsert: { nftId },
      },
      { upsert: true },
    );
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Post('/trade/settings/evm')
  async updateEvmTradeSettings(
    @Request() request,
    @Query('chain') chain: string = 'bsc',
    @Query('agentId') agentId: string,
    @Body() tradeSettingsDTO: EvmTradeSettingsDTO
  ) {
    validateTradeSettingsEvm(tradeSettingsDTO);
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    const { nftId } = await this.mongo.nfts.findOne({ agentId });

    await this.mongo.nftConfigs.updateOne(
      { nftId },
      {
        $set: {
          [`tradeSettings.${chain}`]: tradeSettingsDTO,
        },
        $setOnInsert: { nftId },
      },
      { upsert: true },
    );
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Get('/copy-trades')
  async getAgentCopyTrades(
    @Query('agentId') agentId: string,
    @Request() request,
  ) {
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    return await this.tradeService.getCopyTrades(agentId);
  }

  @UseGuards(AuthGuard)
  @Post('/copy-trade/status')
  async enableCopyTrade(
    @Query('agentId') agentId: string,
    @Query('id') id: number,
    @Query('status') status: 'running' | 'paused',
    @Request() request,
  ) {
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    await this.tradeService.updateCopyTradeStatus(agentId, id, status);
  }

  @UseGuards(AuthGuard)
  @Delete('/copy-trade')
  async deleteCopyTrade(
    @Query('agentId') agentId: string,
    @Query('id') id: number,
    @Request() request,
  ) {
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    await this.tradeService.cancelCopyTrade(agentId, id);
  }

  @UseGuards(AuthGuard)
  @Post('/copy-trade')
  async updateCopyTrade(
    @Query('agentId') agentId: string,
    @Query('id') id: number,
    @Body() copyTrade: CopyTrade,
    @Request() request,
  ) {
    await this.elizaManager.ensureAgentOwner(
      agentId,
      request['X-USER-ADDRESS'],
    );
    await this.tradeService.updateCopyTrade(agentId, id, copyTrade);
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
