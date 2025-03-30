import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { elizaLogger, IAgentRuntime } from '@elizaos/core';

import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
} from '@solana/spl-token';
import { getRuntimeKey } from '../environment.js';
import { getWalletKey } from '../keypairUtils.js';

export const STANDARD_SOL_ADDRESS =
  'So11111111111111111111111111111111111111111';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getSolanaClient(runtime: IAgentRuntime) {
  const rpcUrl = getRuntimeKey(runtime, 'SOLANA_RPC_URL');
  const { keypair } = await getWalletKey(runtime, true);
  return new SolanaClient(rpcUrl, keypair.publicKey);
}

export class SolanaClient {
  connection: Connection;
  publicKey: PublicKey;
  constructor(rpcUrl: string, publicKey: PublicKey) {
    this.connection = new Connection(rpcUrl);
    this.publicKey = publicKey;
  }


  async getMintDecimals(token: string): Promise<number | undefined> {
    if (token === STANDARD_SOL_ADDRESS) {
      return 9;
    }
    const mintInfo = await this.connection.getParsedAccountInfo(
      new PublicKey(token),
    );
    const mintDecimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals;
    if (!mintDecimals || isNaN(mintDecimals)) {
      return undefined;
    }
    return mintDecimals;
  }

  async getUIBalance(token: string) {
    try {
      // WSOL
      if (
        token === NATIVE_MINT.toBase58() ||
        token === 'So11111111111111111111111111111111111111111' ||
        token.toUpperCase() === 'SOL' ||
        token.toUpperCase() === 'WSOL'
      ) {
        return await this.getSOLBalance();
      }
      return await this.getSPLBalance(token);
    } catch (e) {
      if (e.message?.includes('Invalid param: could not find account')) {
        elizaLogger.warn(`Invalid param: could not find account, token=${token}, address=${this.publicKey.toBase58()}`);
        return 0;
      } else {
        throw e;
      }
    }
  }

  async getRawBalance(token: string): Promise<string> {
    try {
      // WSOL
      if (
        token === NATIVE_MINT.toBase58() ||
        token === 'So11111111111111111111111111111111111111111' ||
        token.toUpperCase() === 'SOL' ||
        token.toUpperCase() === 'WSOL'
      ) {
        return await this.connection.getBalance(this.publicKey).toString();
      }
      const tokenAccountBalance = await this.getSPLAccountBalance(token);
      return tokenAccountBalance?.value.amount || '0';
    } catch (e) {
      if (e.message?.includes('Invalid param: could not find account')) {
        return '0';
      } else {
        throw e;
      }
    }
  }

  async getTokenAccount(mintTokenAddress: string){
    const programId = await this.getTokenProgramId(mintTokenAddress);
    const associatedAccount = getAssociatedTokenAddressSync(
      new PublicKey(mintTokenAddress),
      this.publicKey,
      false,
      programId,
    );
    return associatedAccount;
  }

  async getTokenProgramId(mintTokenAddress: string) {
    const address = new PublicKey(mintTokenAddress);
    const accountInfo = await this.connection.getParsedAccountInfo(address);
    if (accountInfo.value.owner.equals(TOKEN_2022_PROGRAM_ID))
      return TOKEN_2022_PROGRAM_ID;
    if (accountInfo.value.owner.equals(TOKEN_PROGRAM_ID))
      return TOKEN_PROGRAM_ID;
    throw new Error(
      `Invalid token program ID, mint=${mintTokenAddress}, owner=${accountInfo.value.owner.toBase58()}`,
    );
  }

  private async getSOLBalance() {
    const balance = await this.connection.getBalance(this.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  private async getSPLBalance(mintTokenAddress: string) {
    const balance = await this.getSPLAccountBalance(mintTokenAddress);
    return balance?.value.uiAmount || 0;
  }

  private async getSPLAccountBalance(mintTokenAddress: string) {
    try {
      const programId = await this.getTokenProgramId(mintTokenAddress);
      const associatedAccount = getAssociatedTokenAddressSync(
        new PublicKey(mintTokenAddress),
        this.publicKey,
        false,
        programId,
      );
      return await this.connection.getTokenAccountBalance(associatedAccount);
    } catch (e) {
      if (e.message?.includes('Invalid param: could not find account')) {
        return null;
      } else {
        throw e;
      }
    }
  }

  private async isBlockhashExpired(lastValidBlockHeight: number) {
    const currentBlockHeight =
      await this.connection.getBlockHeight('confirmed');
    return currentBlockHeight > lastValidBlockHeight - 150;
  }

  async waitTransactionEnd(signature: string) {
    let hashExpired = false;
    let txSuccess = false;
    const startTime = new Date();
    const lastValidHeight = await this.connection.getBlockHeight('confirmed');
    const checkInterval = 1000;

    while (!hashExpired && !txSuccess) {
      const { value: statuses } = await this.connection.getSignatureStatuses([
        signature,
      ]);

      if (!statuses || statuses.length === 0) {
        throw new Error('Failed to get signature status');
      }

      const status = statuses[0];

      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }

      // Break loop if transaction has succeeded
      if (
        status &&
        (status.confirmationStatus === 'confirmed' ||
          status.confirmationStatus === 'finalized')
      ) {
        txSuccess = true;
        const endTime = new Date();
        const elapsed = (endTime.getTime() - startTime.getTime()) / 1000;
        elizaLogger.info(
          `Transaction Success. Elapsed time: ${elapsed} seconds.`,
        );
        elizaLogger.info(
          `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        );
        break;
      }

      hashExpired = await this.isBlockhashExpired(lastValidHeight);

      // Break loop if blockhash has expired
      if (hashExpired) {
        const endTime = new Date();
        const elapsed = (endTime.getTime() - startTime.getTime()) / 1000;
        elizaLogger.warn(
          `Blockhash has expired. Elapsed time: ${elapsed} seconds.`,
        );
        // (add your own logic to Fetch a new blockhash and resend the transaction or throw an error)
        break;
      }

      await sleep(checkInterval);
    }
  }
}
