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
import { ApiCreatedResponse } from '@nestjs/swagger';
import { autoFixTwitterUsername } from '@xnomad/task-manager';

import { CacheTTL } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import AsyncRetry from 'async-retry';
import { ethers } from 'ethers';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { CharacterConfig } from '../shared/mongo/types.js';
import { TradeMonitorService } from '../shared/trade-monitor.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { testTwitterConfig } from '../shared/twitter.service.js';
import { DISABLE_NFT_ADMIN_CHECK } from '../static-settings.js';
import { UpdateTwitterConfigDto } from './nft.dto.js';
import { NftService } from './nft.service.js';
import { NftSearchQueryDto, normalizeBlockchainAddress } from './nft.types.js';
import { GetAgentBindingSocietyInfoResponseDto } from './dto/nft-feature.dto.js';
import { NftConfigService } from './nft-config.service.js';

@Controller('/nft')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private readonly nftConfigService: NftConfigService,
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

  @Get('/:chain/address/:address/nfts')
  async getNftsByOwner(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('collectionId') collectionId: string,
  ) {
    address = normalizeBlockchainAddress(chain, address);
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
      !DISABLE_NFT_ADMIN_CHECK &&
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

    if (updateTwitterConfigDto.testContent) {
      // if the twitter client is already running, using this function will cause `Authentication error: DenyLoginSubtask`
      // TODO, read latest task status as test result of the twitter account
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
    }

    await this.nftService.updateNftConfig({
      nftId,
      characterConfig: instanceToPlain(updateTwitterConfigDto.characterConfig),
    });
    return { isLogin: true };
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
      !DISABLE_NFT_ADMIN_CHECK &&
      !(await this.nftService.isNftAdmin(chain, address, nftId))
    ) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }

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
    if (
      !DISABLE_NFT_ADMIN_CHECK &&
      !(await this.nftService.isNftAdmin(chain, address, nftId))
    ) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    return await this.nftService.updateNftConfig({
      nftId,
      characterConfig,
    });
  }

  @ApiCreatedResponse({
    type: GetAgentBindingSocietyInfoResponseDto,
    description: 'Get agent binding society info',
  })
  @UseGuards(AuthGuard)
  @Get('/:chain/:nftId/public/config')
  async getAgentBindingSocietyInfo(
    @Param('chain') chain: string,
    @Param('nftId') nftId: string,
  ) {
    const resp = await this.nftConfigService.getNftBindingSocietyInfo(
      nftId,
      chain,
    );

    if (resp.twitterUsername) {
      resp.twitterUsername = autoFixTwitterUsername(
        resp.twitterUsername
      );
    }

    return { ...resp, telegramBotId: resp.telegramBotUsername };
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
      !DISABLE_NFT_ADMIN_CHECK &&
      !(await this.nftService.isNftAdmin(chain, address, nftId))
    ) {
      throw new UnauthorizedException('You are not the owner of this NFT');
    }
    return await this.nftService.getNftConfig(nftId, chain);
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
      isAdmin: owner?.ownerAddress === normalizeBlockchainAddress(chain, address),
    };
  }

  @Get('agent-created-tokens')
  async getAgentCreatedTokens(
    @Query('chain') chain: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('creatorAddress') creatorAddress?: string,
    @Query('onlyBound') onlyBound?: string,
  ) {
    const response = await this.tradeMonitorService.getAgentCreatedTokens({
      chain: chain ?? 'solana', // compatible with old API calls that don't specify chain
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
      offset,
      limit,
      creatorAddress,
      onlyBound: Boolean(onlyBound),
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
  async getPaymentUpdatePrimaryCoin(@Param('chain') chain: string) {
    return this.getBindPrimaryCoinPaymentInfo(chain);
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

    const { recipient, solAmount } = this.getBindPrimaryCoinPaymentInfo(chain);

    if (chain === 'solana') {
      const validateTx = async (
        txid: string,
        payer: string,
        expectedRecipient: string,
        expectedSol: number,
      ) => {
        this.logger.log(`Validating payment tx ${txid}`);
        const connection = new Connection(this.config.get('SOLANA_RPC_URL'));

        const tx = await AsyncRetry(
          async (bail) => {
            const tx = await connection.getParsedTransaction(txid, {
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed',
            });
            if (!tx) {
              throw new Error(`not found`);
            }
            return tx;
          },
          {
            retries: 30,
            maxTimeout: 3000,
            onRetry: (error, attempt) => {
              this.logger.warn(
                `Attempt ${attempt}: failed to get payment tx ${txid}: ${error}`,
              );
            },
          },
        );

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

        this.logger.log(`Payment tx ${txid} is valid`);
      };
      await validateTx(body.paymentTxId, address, recipient, solAmount);
    } else {
      const validateTx = async (
        txid: string,
        payer: string,
        expectedRecipient: string,
        expectedBnb: number,
      ) => {
        this.logger.log(`Validating BSC payment tx ${txid}`);

        const provider = new ethers.JsonRpcProvider(
          this.config.get('BSC_RPC_URL'),
        );

        const tx = await AsyncRetry(
          async (bail) => {
            const tx = await provider.getTransaction(txid);
            if (!tx) {
              throw new Error(`Transaction not found: ${txid}`);
            }
            return tx;
          },
          {
            retries: 30,
            maxTimeout: 3000,
            onRetry: (error, attempt) => {
              this.logger.warn(
                `Attempt ${attempt}: failed to get BSC payment tx ${txid}: ${error}`,
              );
            },
          },
        );

        if (tx.from.toLowerCase() !== payer.toLowerCase()) {
          throw new Error(
            `Invalid payer address: ${tx.from}, expected: ${payer}`,
          );
        }
        if (tx.to?.toLowerCase() !== expectedRecipient.toLowerCase()) {
          throw new Error(
            `Invalid recipient: ${tx.to}, expected: ${expectedRecipient}`,
          );
        }
        if (tx.value < ethers.parseEther(expectedBnb.toString())) {
          throw new Error(
            `Invalid amount: ${ethers.formatEther(tx.value)} BNB, expected: ${expectedBnb} BNB`,
          );
        }

        const block = await provider.getBlock(tx.blockNumber!);
        if (Date.now() / 1000 - block.timestamp > 15 * 60) {
          throw new Error(`Payment tx is expired: ${txid}`);
        }

        this.logger.log(`Payment tx ${txid} is valid`);
      };
      await validateTx(body.paymentTxId, address, recipient, solAmount);
    }

    await this.tradeMonitorService.setOverrideMetadataForAgentCreatedToken({
      address: primaryCoin.mintAddress,
      override: {
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

  private getBindPrimaryCoinPaymentInfo(chain: string) {
    if (chain === 'solana') {
      return {
        recipient: this.config.get('SOLANA_LAUNCHPAD_FEE_RECIPIENT_ADDRESS'),
        solAmount: process.env.RUN_ENV === 'dev' ? 0.0001 : 1,
      };
    } else {
      return {
        recipient: this.config.get('BSC_LAUNCHPAD_FEE_RECIPIENT_ADDRESS'),
        solAmount: process.env.RUN_ENV === 'dev' ? 0.0001 : 0.2,
      };
    }
  }
}
