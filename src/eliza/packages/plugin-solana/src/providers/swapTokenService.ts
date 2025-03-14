import { NATIVE_MINT } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import okxService from './okxService.js';
import {
  OkxParams,
  OkxSwapResponse,
  SwapTokenDto,
  SwapTransaction,
} from './type.js';
import {
  bloxValidatorNodeService,
  jitoValidatorNodeService,
} from './validatorNodeService.js';
export class SwapTokenService {
  private readonly logger: Console;
  private readonly LAMPORTS_PER_SOL = 1000000000;
  private readonly SOL_ADDRESS = '11111111111111111111111111111111';
  constructor() {
    this.logger = console;
  }

  async swapToken({
                    connection,
                    amount,
                    slippage,
                    inputTokenCA,
                    outputTokenCA,
                    priorityFee,
                    keyPair,
                    tip,
                    mode = 'FAST',
                    userWalletAddress,
                  }: SwapTokenDto): Promise<string> {
    try {

      if (inputTokenCA === NATIVE_MINT.toBase58()) {
        inputTokenCA = this.SOL_ADDRESS;
      }
      if (outputTokenCA === NATIVE_MINT.toBase58()) {
        outputTokenCA = this.SOL_ADDRESS;
      }

      if (!isFinite(tip) || tip < 0.001 * this.LAMPORTS_PER_SOL) {
        tip = 0.001 * this.LAMPORTS_PER_SOL;
      }

      if (!slippage || slippage < 0 || slippage > 1) {
        throw new Error('Invalid slippage, slippage should be between 0 and 1');
      }

      if (mode === 'ANTI_MEV' && priorityFee < 0.018) {
        throw new Error(
          'In ANTI_MEV mode, priority fee should be greater than 0.018',
        );
      }

      this.logger.info(
        `[swap token] Swapping ${amount} ${inputTokenCA} to ${outputTokenCA}`,
      );

      if (!connection || !userWalletAddress) {
        throw new Error('Missing required parameters');
      }

      const validatorNode =
        mode === 'FAST' ? bloxValidatorNodeService : jitoValidatorNodeService;

      const computeUnitLimit = 300000;
      const computeUnitPrice =
        Math.floor((priorityFee * 10 ** 9 * 100) / computeUnitLimit) * 10 ** 4;

      const okxParams: OkxParams = {
        amount: amount.toString(),
        slippage: slippage.toString(),
        chainId: '501',
        userWalletAddress,
        computeUnitPrice: `${computeUnitPrice}`,
        computeUnitLimit: `${computeUnitLimit}`,
        fromTokenAddress: inputTokenCA,
        toTokenAddress: outputTokenCA,
      };
      this.logger.info('okxParams', JSON.stringify(okxParams));

      const okxResponse = await this.getOKXCallData(okxParams);

      const tx = await this.parseSwapData(okxResponse, connection);

      const transferInstructions = await validatorNode.makeTransferInstruction(
        new PublicKey(userWalletAddress),
        tip,
      );

      await this.appendInstruction(tx, connection, ...transferInstructions);

      const simulation = await this.simulateTransaction(tx, connection);

      if (simulation.value.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
        );
      }

      if (simulation.value.unitsConsumed > 250_000) {
        const adjustedComputeUnitLimit = Math.floor(
          simulation.value.unitsConsumed * 1.5,
        );
        const adjustedComputeUnitPrice =
          Math.floor((priorityFee * 100) / adjustedComputeUnitLimit) * 10 ** 4;

        okxParams.computeUnitLimit = `${adjustedComputeUnitLimit}`;
        okxParams.computeUnitPrice = `${adjustedComputeUnitPrice}`;

        const newOkxResponse = await this.getOKXCallData(okxParams);
        const newTx = await this.parseSwapData(newOkxResponse.data, connection);
        await this.appendInstruction(
          newTx,
          connection,
          ...transferInstructions,
        );

        const signedTx = await this.signTransaction(keyPair, newTx);
        const serializedTx = this.serializeTransaction(signedTx);
        return await validatorNode.postSubmit(serializedTx);
      }

      const signedTx = await this.signTransaction(keyPair, tx);

      const serializedTx = this.serializeTransaction(signedTx);

      return await validatorNode.postSubmit(serializedTx);
    } catch (error) {
      throw new Error(
        `Swap token failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async simulateTransaction(
    tx: SwapTransaction,
    connection: Connection,
  ) {
    try {
      if (tx instanceof VersionedTransaction) {
        const simulation = await connection.simulateTransaction(tx, {
          sigVerify: false,
          replaceRecentBlockhash: true,
        });

        return {
          value: {
            unitsConsumed: simulation.value.unitsConsumed || 0,
            logs: simulation.value.logs || [],
            err: simulation.value.err,
          },
        };
      } else {
        const simulation = await connection.simulateTransaction(tx, [], true);

        return {
          value: {
            unitsConsumed: simulation.value.unitsConsumed || 0,
            logs: simulation.value.logs || [],
            err: simulation.value.err,
          },
        };
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Transaction simulation failed: ${error.message}`);
      }
      throw new Error('Transaction simulation failed with unknown error');
    }
  }

  private async signTransaction(
    keypair: Keypair,
    tx: SwapTransaction,
  ): Promise<SwapTransaction> {
    if (!keypair) {
      throw new Error('Payer keypair not initialized');
    }

    if (tx instanceof VersionedTransaction) {
      tx.sign([keypair]);
    } else {
      tx.partialSign(keypair);
    }

    if (!this.verifySignature(tx)) {
      throw new Error('Transaction signature verification failed');
    }

    return tx;
  }

  private verifySignature(tx: SwapTransaction): boolean {
    if (tx instanceof VersionedTransaction) {
      return (
        tx.signatures.length > 0 &&
        tx.signatures.every((sig) => sig.length === 64)
      );
    } else {
      return (
        tx.signatures.length > 0 &&
        tx.signatures.every((sig) => sig.signature !== null)
      );
    }
  }

  private async getOKXCallData(params: OkxParams): Promise<OkxSwapResponse> {
    if(params.fromTokenAddress === this.SOL_ADDRESS || params.toTokenAddress === this.SOL_ADDRESS) {
      params.directRoute = true;
    }
    return await okxService.getCallData(params);
  }

  private async parseSwapData(
    swapData: any,
    connection: Connection,
  ): Promise<SwapTransaction> {
    const swapTransaction = swapData?.data?.[0]?.tx?.data;
    if (!swapTransaction) {
      throw new Error(swapData?.msg || 'No swap transaction found');
    }

    const swapTransactionBuf = bs58.decode(swapTransaction);
    let transaction: SwapTransaction;

    try {
      transaction = Transaction.from(swapTransactionBuf);
    } catch (error) {
      transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    }

    const latestBlockhash = await connection.getLatestBlockhash();
    if (transaction instanceof VersionedTransaction) {
      transaction.message.recentBlockhash = latestBlockhash.blockhash;
    } else {
      transaction.recentBlockhash = latestBlockhash.blockhash;
    }

    return transaction;
  }

  private async appendInstruction(
    tx: SwapTransaction,
    connection: Connection,
    ...instructions: TransactionInstruction[]
  ): Promise<void> {
    if (tx instanceof VersionedTransaction) {
      const addressLookupTableAccounts = await Promise.all(
        tx.message.addressTableLookups.map(async (lookup) => {
          const accountInfo = await connection.getAccountInfo(
            lookup.accountKey,
          );
          if (!accountInfo) {
            throw new Error(
              `Account info not found for lookup table: ${lookup.accountKey.toBase58()}`,
            );
          }
          return new AddressLookupTableAccount({
            key: lookup.accountKey,
            state: AddressLookupTableAccount.deserialize(accountInfo.data),
          });
        }),
      );

      const message = TransactionMessage.decompile(tx.message, {
        addressLookupTableAccounts,
      });
      message.instructions.push(...instructions);
      tx.message = message.compileToV0Message(addressLookupTableAccounts);
    } else {
      tx.add(...instructions);
    }
  }

  private serializeTransaction(tx: SwapTransaction): string {
    try {
      if (tx instanceof VersionedTransaction) {
        return Buffer.from(tx.serialize()).toString('base64');
      } else {
        return Buffer.from(tx.serialize({})).toString('base64');
      }
    } catch (error) {
      throw new Error(
        `Transaction serialization failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  static async getTokenBalanceChange(
    connection: Connection,
    txSignature: string,
    tokenAccount: PublicKey,
  ) {
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      throw new Error(`Transaction not found or metadata missing, ${txSignature}`);
    }


    const preBalance = tx.meta.preTokenBalances?.find(
      (b) => tx.transaction.message.accountKeys[b.accountIndex].pubkey.toBase58() === tokenAccount.toBase58()
    )?.uiTokenAmount.amount || '0';

    const postBalance = tx.meta.postTokenBalances?.find(
      (b) => tx.transaction.message.accountKeys[b.accountIndex].pubkey.toBase58() === tokenAccount.toBase58()
    )?.uiTokenAmount.amount || '0';

    return {preBalance, postBalance};
  }
}