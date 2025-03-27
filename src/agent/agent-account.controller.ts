import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { HttpService } from '@nestjs/axios';
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
import * as ethers from 'ethers';
import { firstValueFrom } from 'rxjs';
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
    private readonly httpService: HttpService,
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
    if (chain === 'bsc') {
      return await this.getBscTransferTxs(address, limit);
    } else if (chain === 'solana') {
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
    } else {
      return {
        items: [],
      };
    }
  }

  private async getBscTransferTxs(address: string, limit: number) {
    const bscScanApiKey = this.config.get('BSCSCAN_API_KEY');
    const bscScanUrl = 'https://api.bscscan.com/api';
    const provider = new ethers.JsonRpcProvider(this.config.get('BSC_RPC_URL'));

    // Get token transfer records
    const tokenTxResponse = await firstValueFrom(
      this.httpService.get(bscScanUrl, {
        params: {
          module: 'account',
          action: 'tokentx',
          address: address,
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: limit,
          sort: 'desc',
          apikey: bscScanApiKey,
        },
      }),
    );

    if (tokenTxResponse.data.status !== '1') {
      this.logger.error(
        `Failed to fetch token transactions: ${tokenTxResponse.data.message}`,
      );
      return { items: [] };
    }

    interface TokenTx {
      hash: string;
      from: string;
      to: string;
      value: string;
      tokenDecimal: string;
      tokenSymbol: string;
      blockNumber: string;
      timeStamp: string;
      contractAddress: string;
      tokenName: string;
      nonce: string;
      blockHash: string;
      transactionIndex: string;
      gas: string;
      gasPrice: string;
      gasUsed: string;
      cumulativeGasUsed: string;
      input: string;
      confirmations: string;
    }
    const tokenTxs: TokenTx[] = tokenTxResponse.data.result || [];

    // Process all transactions in parallel
    const transferPromises = tokenTxs.map(async (tokenTx) => {
      try {
        const tx = await provider.getTransaction(tokenTx.hash);
        if (!tx) return null;

        // Check transaction input data
        if (
          tx.data === '0x' || // Regular BNB transfer
          tx.data.startsWith('0xa9059cbb') // ERC20 transfer method signature
        ) {
          return {
            type: 'transfer',
            source: tokenTx.from,
            destination: tokenTx.to,
            amount: tokenTx.value,
            tokenMint: tokenTx.contractAddress,
            decimals: parseInt(tokenTx.tokenDecimal),
            symbol: tokenTx.tokenSymbol,
            signature: tokenTx.hash,
            slot: parseInt(tokenTx.blockNumber),
            time: parseInt(tokenTx.timeStamp),
          };
        }
        return null;
      } catch (error) {
        this.logger.error(
          `Failed to fetch transaction ${tokenTx.hash}:`,
          error,
        );
        return null;
      }
    });

    const transfers = (await Promise.all(transferPromises)).filter(
      (transfer): transfer is NonNullable<typeof transfer> =>
        transfer !== null &&
        (transfer.source.toLowerCase() === address.toLowerCase() ||
          transfer.destination.toLowerCase() === address.toLowerCase()),
    );

    return { items: transfers };
  }
}
