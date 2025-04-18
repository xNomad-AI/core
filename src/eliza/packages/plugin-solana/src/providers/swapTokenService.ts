import { getOrCreateAssociatedTokenAccount, NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Connection,
  Keypair, LAMPORTS_PER_SOL,
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
  defaultRPCNodeService,
} from './validatorNodeService.js';
import { getSWAP_FEE_ACCOUNT, getSWAP_FEE_BPS } from './swapUtils';
import { SolanaClient } from './solanaClient';
export class SwapTokenService {
  private readonly logger: Console;
  private readonly LAMPORTS_PER_SOL = 1000000000;
  private readonly SOL_ADDRESS = '11111111111111111111111111111111';
  constructor() {
    this.logger = console;
  }


  async swapTokenJupiter(
    {
      connection,
      amount,
      slippage,
      inputTokenCA,
      outputTokenCA,
      priorityFee,
      keyPair,
      tip,
      mode = 'FAST',
    }:SwapTokenDto
  ): Promise<any> {
    try {
      const walletPublicKey = keyPair.publicKey;
      const client = new SolanaClient(connection.rpcEndpoint, walletPublicKey);
      const inputProgramId = await client.getTokenProgramId(inputTokenCA);
      const outProgramId = await client.getTokenProgramId(outputTokenCA);
      // get or create fee token account after check to prevent invalid token account creation
      // only add fee account if the token is not a 2022 token
      // https://station.jup.ag/docs/swap-api/add-fees-to-swap#important-notes
      let tokenFeeAccount: PublicKey = undefined;
      let url = `https://api.jup.ag/swap/v1/quote?inputMint=${inputTokenCA}&outputMint=${outputTokenCA}&amount=${amount.toString()}&dynamicSlippage=true&autoSlippage=true&maxAccounts=64&onlyDirectRoutes=false&asLegacyTransaction=false&restrictIntermediateTokens=true`;
      // decide use which token to re collect fees
      const feeTokenCA = outputTokenCA === NATIVE_MINT.toBase58() ? outputTokenCA : inputTokenCA;
      const feeProgramId = feeTokenCA === outputTokenCA ? outProgramId : inputProgramId;
      if (
        getSWAP_FEE_BPS() !== undefined &&
        getSWAP_FEE_ACCOUNT() !== undefined &&
        !outProgramId.equals(TOKEN_2022_PROGRAM_ID) &&
        !inputProgramId.equals(TOKEN_2022_PROGRAM_ID)
      ) {
         tokenFeeAccount = (
          await getOrCreateAssociatedTokenAccount(
            connection,
            keyPair,
            new PublicKey(feeTokenCA),
            new PublicKey(getSWAP_FEE_ACCOUNT()),
            true,
            'confirmed',
            {
              skipPreflight: true,
              preflightCommitment: 'confirmed',
              commitment: 'confirmed',
            },
            feeProgramId,
          )
        ).address;
        url += `&platformFeeBps=${getSWAP_FEE_BPS()}`;
      }

      const quoteResponse = await fetch(url);
      const quoteData = await quoteResponse.json();

      if (!quoteData || quoteData.error) {
        throw new Error(
          `Failed to get quote: ${quoteData?.error || 'Unknown error'}`,
        );
      }

      this.logger.log('Quote received:', quoteData);

      const swapRequestBody: any = {
        quoteResponse: quoteData,
        userPublicKey: walletPublicKey.toBase58(),
        feeAccount: tokenFeeAccount?.toBase58(),
      };

      if (mode === 'ANTI_MEV'){
        swapRequestBody.prioritizationFeeLamports = {
          jitoTipLamports: (priorityFee) * LAMPORTS_PER_SOL
        }
      }else {
        swapRequestBody.prioritizationFeeLamports = {
          priorityLevelWithMaxLamports: {
            global: false,
            maxLamports: (priorityFee || 0) * LAMPORTS_PER_SOL,
            priorityLevel: 'veryHigh',
          },
        }
      }

      if (slippage){
        swapRequestBody.slippageBps = Math.round(slippage * 10000);
      }else{
        swapRequestBody.dynamicComputeUnitLimit = true;
        swapRequestBody.dynamicSlippage = true;
      }

      this.logger.log('Requesting swap with body:', swapRequestBody);

      const swapResponse = await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(swapRequestBody),
      });

      const swapData = await swapResponse.json();

      if (!swapData || !swapData.swapTransaction) {
        throw new Error(
          `Failed to get swap transaction: ${swapData?.error || 'No swap transaction returned'}`,
        );
      }

      const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(transactionBuf);
      const validatorNode =
        mode === 'FAST' ? defaultRPCNodeService : jitoValidatorNodeService;
      if (tip && tip > 0) {
        const transferInstructions = await validatorNode.makeTransferInstruction(
          walletPublicKey,
          tip,
        );
        await this.appendInstruction(tx, connection, ...transferInstructions);
      }

      const simulation = await this.simulateTransaction(tx, connection);
      if (simulation.value.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
        );
      }

      const signedTx = await this.signTransaction(keyPair, tx);
      const serializedTx = this.serializeTransaction(signedTx);

      return await validatorNode.postSubmit(serializedTx);
    } catch (error) {
      this.logger.error('Error in swapToken:', error);
      throw error;
    }
  }


  async swapToken(req : SwapTokenDto): Promise<string> {
    if (!isFinite(req.tip) || req.tip < 0.001 * this.LAMPORTS_PER_SOL) {
      req.tip = 0.001 * this.LAMPORTS_PER_SOL;
    }

    if (!req.slippage || req.slippage < 0 || req.slippage > 1) {
      throw new Error('Invalid slippage, slippage should be between 0 and 1');
    }

    if (req.mode === 'ANTI_MEV' && req.priorityFee < 0.018) {
      throw new Error(
        'In ANTI_MEV mode, priority fee should be greater than 0.018',
      );
    }

    this.logger.info(
      `[swap token] Swapping ${req.amount} ${req.inputTokenCA} to ${req.outputTokenCA}`,
    );

    if (!req.connection || !req.userWalletAddress) {
      throw new Error('Missing required parameters');
    }
    return await this.swapTokenJupiter(req);
  }

  async swapTokenOkx({
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
    if (inputTokenCA === NATIVE_MINT.toBase58()) {
      inputTokenCA = this.SOL_ADDRESS;
    }
    if (outputTokenCA === NATIVE_MINT.toBase58()) {
      outputTokenCA = this.SOL_ADDRESS;
    }
    try {
      const validatorNode =
        mode === 'FAST' ? defaultRPCNodeService : jitoValidatorNodeService;

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
        if (error?.message?.includes('ProgramFailedToComplete')){
          throw new Error(`Transaction simulation failed: ${error.message}, The input value might be too low, which could lead to calculation issues or fail to cover fees.  
Try increasing the swap value and try again.`);
        }else{
          throw new Error(`Transaction simulation failed: ${error.message}`);
        }
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
    if (params.slippage === '1'){
      params.autoSlippage = true;
      params.maxAutoSlippage = "0.99"; // okx max slippage should be less than 1
    }

    const feePercent = Number(getSWAP_FEE_BPS()) / 100;
    const feeAccount = getSWAP_FEE_ACCOUNT();
    if (feePercent && feeAccount) {
      params.feePercent = feePercent.toString();
      params.toTokenAddress === this.SOL_ADDRESS ?
        params.toTokenReferrerWalletAddress = feeAccount :
        params.fromTokenReferrerWalletAddress = feeAccount;
    }

    return await okxService.getCallData(params);
  }

  private async parseSwapData(
    swapData: any,
    connection: Connection,
  ): Promise<SwapTransaction> {
    const swapTransaction = swapData?.data?.[0]?.tx?.data;
    if (!swapTransaction) {
      throw new Error(swapData?.msg || 'Transaction router not found, please try again later');
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