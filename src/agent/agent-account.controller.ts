import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  getAccount,
  getExtensionData,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { getWalletPortfolio } from '@elizaos/plugin-evm';
import { unpack } from '@solana/spl-token-metadata';
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { BirdeyeService } from '../shared/birdeye.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Controller('/agent-account')
export class AgentAccountController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly birdEye: BirdeyeService,
    private readonly config: ConfigService,
    private readonly logger: TransientLoggerService,
  ) {}

  @Get('/')
  async getAgentAccount(
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

  @Get('/defi/txs')
  async getTxs(
    @Query('chain') chain: string,
    @Query('address') address: string,
    @Query('beforeTime') beforeTime: number,
    @Query('afterTime') afterTime: number,
    @Query('limit') limit: number,
  ) {
    return await this.birdEye.getTxs({ chain, address, afterTime, beforeTime, limit });
  }

  @Get('/defi/portfolio')
  async getPortfolio(
    @Query('chain') chain: string,
    @Query('address') address: string,
  ) {
    if (chain !== 'solana') {
      address = address.toLowerCase();
    }
    let portfolio;
    switch (chain) {
      case 'solana':
        portfolio = await this.birdEye.getWalletPortfolio({ chain, address });
        break;
      default:
        const moralisApikey = this.config.get('MORALIS_API_KEY');
        portfolio = await getWalletPortfolio(address, chain, { moralisApikey });
        break;
    }
    const tokens: string[] = Array.from(
      new Set(
        portfolio.items.map((item) => chain === 'solana' ? item.address : item.address.toLowerCase())
      )
    );
    const agentCoins = await this.elizaManager.getAgentCoins(chain, tokens);
    const coinMap = new Map<string, any>();
    agentCoins.forEach((coin) => {
      coinMap.set(coin.address, coin);
    });
    portfolio.items.forEach((item) => {
      const coin = coinMap.get(item.address);
      if (coin) {
        item.agentCoin = coin;
      }
    });
    return portfolio;
  }

  @Get('/defi/agents/portfolio')
  async getAgentsPortfolio(
    @Query('chain') chain: string,
    @Query('address') address: string,
    @Query('collectionIds') collectionIds?: string | string[],
  ) { 
    if (typeof collectionIds === 'string') {
      collectionIds = collectionIds.split(',');
    }
    if (chain !== 'solana') {
      address = address.toLowerCase();
    }
    const agents = await this.elizaManager.getOwnedAgents(chain, address, collectionIds);
    const extendedAgents = [
      {
        agentAccount: chain === 'solana' ? {
          solana: address,
        }: {
          evm: address,
        },
        isPrimary: true,
      },
      ...agents.map(agent => ({
        ...agent,
        isPrimary: false,
      })),
    ];
    const portfolios = await Promise.all(
      extendedAgents.map(async (agent) => {
        let portfolio;
        switch (chain) {
          case 'solana':
            portfolio = await this.birdEye.getWalletPortfolio({ chain, address: agent.agentAccount.solana });
            break;
          default:
            const moralisApikey = this.config.get('MORALIS_API_KEY');
            portfolio = await getWalletPortfolio(agent.agentAccount.evm, chain, { moralisApikey });
            break;
        }
        return {
          ...portfolio,
          nft: agent.isPrimary ? undefined : agent,
        };
      })
    );
    if (portfolios.length === 0) {
      return {
        portfolios
      }
    }
    const tokens: string[] = Array.from(
      new Set(
        portfolios.flatMap((portfolio) =>
          portfolio.items.map((item) => chain === 'solana' ? item.address : item.address.toLowerCase())
        )
      )
    );
    if (chain === 'solana') {
      const tokensPrice = await this.birdEye.getTokensPrice(chain, tokens);
      if (tokensPrice) {
        portfolios.forEach((portfolio) => {
          portfolio.items.forEach((item) => {
            const tokenPrice = tokensPrice[this.birdEye.transformNativeToken(chain, item.address)];
            if (tokenPrice && tokenPrice.priceChange24h) {
              item.usdPrice24hrPercenChange = tokenPrice.priceChange24h;
            }
          });
        });
      }
    }
    
    const agentCoins = await this.elizaManager.getAgentCoins(chain, tokens);
    const coinMap = new Map<string, any>();
    agentCoins.forEach((coin) => {
      coinMap.set(coin.address, coin);
    });
    portfolios.forEach((portfolio) => {
      portfolio.items.forEach((item) => {
        const coin = coinMap.get(item.address);
        if (coin) {
          item.agentCoin = coin;
          if (!item.usdPrice24hrPercenChange && coin.priceChange24h) {
            item.usdPrice24hrPercenChange = coin.priceChange24h * 100;
          }
          if (!item.logoURI && coin.logo) {
            item.logoURI = coin.logo;
          }
        }
      });
    });
    return {
      portfolios: portfolios.filter((portfolio) => portfolio.items.length > 0)
    };
  }

  @Get('/defi/search')
  async searchToken(
    @Query('chain') chain: string,
    @Query('query') query: string,
  ) {
    return await this.birdEye.searchToken({ chain, query });
  }

  @Get('/defi/transfer-txs')
  async getTransferTxs(
    @Query('chain') chain: string,
    @Query('address') address: string,
    @Query('limit') limit: number,
  ) {
    const connection = new Connection(this.config.get('SOLANA_RPC_URL'));
    const signatureInfos = await connection.getSignaturesForAddress(
      new PublicKey(address),
      {
        limit,
      },
    );
    const signatures = signatureInfos.map((info) => info.signature);

    const txs = await connection.getParsedTransactions(signatures, {
      maxSupportedTransactionVersion: 0,
    });

    let transfers: {
      type: 'sol-transfer' | 'spl-token-transfer';
      source: string; // source address
      destination: string; // destination address
      amount: string; // amount of transfer
      tokenMint?: string; // mint address of the token if type is spl-token-transfer
      symbol: string; // symbol of the token
      decimals: number; // decimals of the token
      signature: string; // signature of the transaction
      slot: number; // slot of the transaction
      time: number; // block time of the transaction
    }[] = [];

    for (const tx of txs) {
      if (tx.meta.err) continue;

      // only consider txs with all instruction programIds in the list
      if (
        tx.transaction.message.instructions.some(
          (ix) =>
            !ix.programId.equals(SystemProgram.programId) &&
            !ix.programId.equals(ComputeBudgetProgram.programId) &&
            !ix.programId.equals(TOKEN_2022_PROGRAM_ID) &&
            !ix.programId.equals(TOKEN_PROGRAM_ID) &&
            !ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID),
        )
      ) {
        continue;
      }

      for (const instruction of tx.transaction.message.instructions) {
        if ('program' in instruction && 'parsed' in instruction) {
          const { type, info } = instruction.parsed;
          const { program, programId } = instruction;

          if (program === 'system' && type === 'transfer') {
            transfers.push({
              type: 'sol-transfer',
              source: info.source,
              destination: info.destination,
              amount: info.lamports.toString(),
              decimals: 9,
              symbol: 'SOL',
              signature: tx.transaction.signatures[0],
              slot: tx.slot,
              time: tx.blockTime!,
            });
          } else if (program === 'spl-token' && type === 'transfer') {
            const sourceAccount = await getAccount(
              connection,
              new PublicKey(info.source),
              'processed',
              programId,
            );
            const destinationAccount = await getAccount(
              connection,
              new PublicKey(info.destination),
              'processed',
              programId,
            );
            const mintAccount = await getMint(
              connection,
              sourceAccount.mint,
              'processed',
              programId,
            );

            let symbol = '';
            try {
              symbol = unpack(
                getExtensionData(
                  ExtensionType.TokenMetadata,
                  mintAccount.tlvData,
                ),
              ).symbol;
            } catch (e) {
              try {
                const umi = createUmi(this.config.get('SOLANA_RPC_URL'));
                const asset = await fetchDigitalAsset(
                  umi,
                  publicKey(sourceAccount.mint),
                );
                symbol = asset.metadata.symbol;
              } catch (e) {
                this.logger.error('failed to fetch digital asset', e);
              }
            }

            transfers.push({
              type: 'spl-token-transfer',
              source: sourceAccount.owner.toBase58(),
              destination: destinationAccount.owner.toBase58(),
              amount: info.amount as string,
              tokenMint: sourceAccount.mint.toBase58(),
              decimals: mintAccount.decimals,
              symbol,
              signature: tx.transaction.signatures[0],
              slot: tx.slot,
              time: tx.blockTime!,
            });
          }
        }
      }
    }

    transfers = transfers.filter(
      (transfer) =>
        transfer.source === address || transfer.destination === address,
    );

    return {
      items: transfers,
    };
  }
}
