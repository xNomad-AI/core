import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { Request as ExpressRequest } from 'express';

import { CacheTTL } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { CharacterConfig } from '../shared/mongo/types.js';
import { TradeMonitorService } from '../shared/trade-monitor.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { testTwitterConfig } from '../shared/twitter.service.js';
import { CORE_ADMIN_API_KEY, DELEGATION_MODE } from '../static-settings.js';
import { SettingsService } from './core-settings.service.js';
import { UpdateCoreSettingsDto, UpdateTwitterConfigDto } from './nft.dto.js';
import { NftService } from './nft.service.js';
import { NftSearchQueryDto } from './nft.types.js';

@Controller('/nft')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private settingsService: SettingsService,
    private tradeMonitorService: TradeMonitorService,
    private config: ConfigService,
    private logger: TransientLoggerService,
  ) {}

  @Get('/:chain/collections')
  async getCollections(@Param('chain') chain: string) {
    return await this.nftService.getCollections(chain);
  }

  @Get('/:chain/collections/:collectionId')
  async getCollectionById(
    @Param('chain') chain: string,
    @Param('collectionId') collectionId: string,
  ) {
    return await this.nftService.getCollectionById(chain, collectionId);
  }

  @Get('/:chain/collections/:collectionId/filter-template')
  async getFilterTemplate(
    @Param('chain') chain: string,
    @Param('collectionId') collectionId: string,
  ) {
    return await this.nftService.getFilterTemplate(chain, collectionId);
  }

  @CacheTTL(10)
  @Get('/:chain/collection/:id/metrics')
  async getCollectionMetrics(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
  ) {
    return await this.nftService.getCollectionMetrics(chain, collectionId);
  }

  @CacheTTL(10)
  @Get('/:chain/collection/:id/nfts')
  async getNfts(
    @Param('chain') chain: string,
    @Param('id') collectionId: string,
    @Query() query: NftSearchQueryDto,
  ) {
    return await this.nftService.getNfts({
      chain,
      collectionId,
      ...query,
    });
  }

  @CacheTTL(5)
  @Get('/:chain/address/:address/nfts')
  async getNftsByOwner(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('collectionId') collectionId: string,
  ) {
    return await this.nftService.getNftsByOwner(chain, address, collectionId);
  }

  @CacheTTL(15)
  @Get('/:chain/nfts/:nftId')
  async getNftById(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    return await this.nftService.getNftById(chain, nftId);
  }

  @UseGuards(AuthGuard)
  @Post('/:chain/:nftId/config/twitter')
  async updateTwitterConfig(
    @Request() request: ExpressRequest,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() updateTwitterConfigDto: UpdateTwitterConfigDto,
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (
      !DELEGATION_MODE &&
      !(await this.nftService.isNftAdmin(chain, address, nftId))
    ) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }

    const username =
      updateTwitterConfigDto.characterConfig.settings.secrets.TWITTER_USERNAME;
    const password =
      updateTwitterConfigDto.characterConfig.settings.secrets.TWITTER_PASSWORD;
    const email =
      updateTwitterConfigDto.characterConfig.settings.secrets.TWITTER_EMAIL;
    const twitter2faSecret =
      updateTwitterConfigDto.characterConfig.settings.secrets
        .TWITTER_2FA_SECRET;

    const result = await testTwitterConfig(
      username,
      password,
      email,
      twitter2faSecret,
      updateTwitterConfigDto.testContent,
    );
    if (!result.isLogin) {
      return result;
    }
    await this.nftService.updateNftConfig({
      nftId,
      characterConfig: instanceToPlain(updateTwitterConfigDto.characterConfig),
    });
    return result;
  }

  @UseGuards(AuthGuard)
  @Delete('/:chain/:nftId/config/twitter')
  async deleteTwitterConfig(
    @Request() request: ExpressRequest,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (
      !DELEGATION_MODE &&
      !(await this.nftService.isNftAdmin(chain, address, nftId))
    ) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }

    const httpProxy = await this.nftService.getTwitterHttpProxy(nftId);
    await this.nftService.updateNftConfig({
      nftId,
      characterConfig: {
        settings: {
          secrets: {
            TWITTER_USERNAME: '',
            TWITTER_PASSWORD: '',
            TWITTER_EMAIL: '',
            TWITTER_2FA_SECRET: '',
          },
        },
      },
    });

    if (httpProxy) {
      await this.settingsService.decreaseHttpProxyCount(httpProxy);
    }
  }

  @UseGuards(AuthGuard)
  @Post('/:chain/:nftId/config')
  async setNftConfig(
    @Request() request: ExpressRequest,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() { characterConfig }: { characterConfig: CharacterConfig },
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    return await this.nftService.updateNftConfig({
      nftId,
      characterConfig,
    });
  }

  @UseGuards(AuthGuard)
  @Get('/:chain/:nftId/config')
  async getNftConfig(
    @Request() request: ExpressRequest,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (
      !DELEGATION_MODE &&
      !(await this.nftService.isNftAdmin(chain, address, nftId))
    ) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    return await this.nftService.getNftConfig(nftId);
  }

  @UseGuards(AuthGuard)
  @Delete('/:chain/:nftId/config')
  async deleteNftConfig(
    @Request() request: ExpressRequest,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    await this.nftService.deleteNftConfig(nftId);
  }

  @UseGuards(AuthGuard)
  @Get('/agent/auth')
  async getAgentAuth(@Query('agentId') agentId: string, @Request() request) {
    const address = request['X-USER-ADDRESS'];
    const chain = request['X-USER-CHAIN'];
    if (!chain || !address) {
      throw new UnauthorizedException('Invalid auth header');
    }
    const owner = await this.nftService.getAgentOwner(agentId);
    return {
      isAdmin: owner?.ownerAddress === address,
    };
  }

  @Post('/settings')
  async updateNftGlobalSettings(
    @Request() request: ExpressRequest,
    @Body() body: UpdateCoreSettingsDto[],
  ) {
    if (!CORE_ADMIN_API_KEY) {
      throw new UnauthorizedException('Admin API key is not set');
    }
    if (
      request.headers['X-ADMIN-API-KEY'.toLowerCase()] !== CORE_ADMIN_API_KEY
    ) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    const inserted = await this.settingsService.upsertCoreSettings(body);
    return {
      inserted,
    };
  }

  @CacheTTL(10)
  @Get('agent-created-tokens')
  async getAgentCreatedTokens(
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('creatorAddress') creatorAddress?: string,
  ) {
    const response = await this.tradeMonitorService.getAgentCreatedTokens({
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
      offset,
      limit,
      creatorAddress,
    });

    await Promise.all(
      response.list.map(async (item) => {
        if (item.override) {
          item.description = item.override.description;
          item.twitter = item.override.twitter;
          item.telegram = item.override.telegram;
          item.website = item.override.website;
        }
        delete item.override;

        item['nft'] = await this.nftService.getNftById(item.chain, item.nftId);
      }),
    );

    return response;
  }

  @UseGuards(AuthGuard)
  @Post('/:chain/:nftId/bind-primary-coin')
  async bindPrimaryCoin(
    @Request() request,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body() body: { address: string },
  ) {
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }

    await this.nftService.bindPrimaryCoin(chain, nftId, body.address);
  }

  @Get('/:chain/:nftId/primary-coin')
  async getPrimaryCoin(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const primaryCoin = await this.nftService.getPrimaryCoin(nftId);
    if (!primaryCoin) {
      return null;
    }
    const coin = await this.tradeMonitorService.getAgentCreateToken(
      primaryCoin.mintAddress,
    );
    if (coin?.override) {
      coin.description = coin.override.description;
      coin.twitter = coin.override.twitter;
      coin.telegram = coin.override.telegram;
      coin.website = coin.override.website;
      delete coin.override;
    }
    return coin;
  }

  @Get('/:chain/:nftId/payment-update-primary-coin')
  async getPaymentUpdatePrimaryCoin() {
    const feeRecipient = this.config.get(
      'SOLANA_LAUNCHPAD_FEE_RECIPIENT_ADDRESS',
    );
    const feeInSol = process.env.RUN_ENV === 'dev' ? 0.0001 : 1;

    return {
      recipient: feeRecipient,
      solAmount: feeInSol,
    };
  }

  @UseGuards(AuthGuard)
  @Post('/:chain/:nftId/update-primary-coin-info')
  async updatePrimaryCoinInfo(
    @Request() request,
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
    @Body()
    body: {
      paymentTxId: string;
      metadata: {
        description: string;
        twitter: string;
        telegram: string;
        website: string;
      };
    },
  ) {
    // validate user is nft admin
    const address = request['X-USER-ADDRESS'];
    chain = request['X-USER-CHAIN'];
    if (!(await this.nftService.isNftAdmin(chain, address, nftId))) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }

    const primaryCoin = await this.nftService.getPrimaryCoin(nftId);
    if (!primaryCoin) {
      throw new Error('Primary coin not found');
    }

    const feeRecipient = this.config.get(
      'SOLANA_LAUNCHPAD_FEE_RECIPIENT_ADDRESS',
    );
    const feeInSol = process.env.RUN_ENV === 'dev' ? 0.0001 : 1;

    const validateTx = async (
      txid: string,
      payer: string,
      expectedRecipient: string,
      expectedSol: number,
    ) => {
      // validate payment txid
      const connection = new Connection(this.config.get('SOLANA_RPC_URL'));

      const tx = await connection
        .getParsedTransaction(txid, {
          maxSupportedTransactionVersion: 0,
        })
        .catch((e) => {
          this.logger.error(`failed to get payment tx ${txid}: ${e}`);
          throw new Error(`failed to get payment tx ${txid}: ${e}`);
        });
      if (!tx) {
        throw new Error(`Payment tx not found: ${txid}`);
      }

      const blockTime = await connection.getBlockTime(tx.slot);
      if (Date.now() / 1000 - blockTime! > 15 * 60) {
        throw new Error(`Payment tx is expired: ${txid}`);
      }

      // find system transfer of some amount of SOL
      const instruction = tx.transaction.message.instructions.find(
        (instruction) => {
          if ('program' in instruction && 'parsed' in instruction) {
            const { type, info } = instruction.parsed;
            const { program, programId } = instruction;

            if (program === 'system' && type === 'transfer') {
              if (
                info.source === payer &&
                info.destination === expectedRecipient &&
                Number(info.lamports.toString()) ===
                  expectedSol * LAMPORTS_PER_SOL
              ) {
                return true;
              }
            }
          }
          return false;
        },
      );
      if (!instruction) {
        const msg = `Invalid payment tx: ${txid}, expected recipient: ${expectedRecipient}, expected amount: ${expectedSol} SOL`;
        this.logger.log(msg);
        throw new Error(msg);
      }
    };

    await validateTx(body.paymentTxId, address, feeRecipient, feeInSol);

    await this.tradeMonitorService.setOverrideMetadataForAgentCreatedToken({
      address: primaryCoin.mintAddress,
      metadata: {
        description: body.metadata.description,
        twitter: body.metadata.twitter,
        telegram: body.metadata.telegram,
        website: body.metadata.website,
      },
    });

    const coin = await this.tradeMonitorService.getAgentCreateToken(
      primaryCoin.mintAddress,
    );
    if (coin?.override) {
      coin.description = coin.override.description;
      coin.twitter = coin.override.twitter;
      coin.telegram = coin.override.telegram;
      coin.website = coin.override.website;
      delete coin.override;
    }
    return coin;
  }
}
