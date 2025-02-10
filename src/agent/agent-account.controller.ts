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
import { unpack } from '@solana/spl-token-metadata';
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { BirdeyeService } from '../shared/birdeye.service.js';
import { ElizaManagerService } from './eliza-manager.service.js';

@Controller('/agent-account')
export class AgentAccountController {
  constructor(
    private readonly elizaManager: ElizaManagerService,
    private readonly birdEye: BirdeyeService,
    private readonly config: ConfigService,
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
    return await this.birdEye.getTxs({ address, afterTime, beforeTime, limit });
  }

  @Get('/defi/portfolio')
  async getPortfolio(
    @Query('chain') chain: string,
    @Query('address') address: string,
  ) {
    return await this.birdEye.getWalletPortfolio({ chain, address });
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
              } catch (e) {}
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
