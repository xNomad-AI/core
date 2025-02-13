import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
} from '@solana/spl-token';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SolanaClient {
  private connection: Connection;
  private keypair: Keypair;
  constructor(rpcUrl: string, keypair: Keypair) {
    this.connection = new Connection(rpcUrl);
    this.keypair = keypair;
  }

  getCollection() {
    return this.connection;
  }

  getKeypair() {
    return this.keypair;
  }

  get publicKey() {
    return this.keypair.publicKey;
  }

  async getBalance(token: string) {
    // WSOL
    if (
      token === NATIVE_MINT.toBase58() ||
      token === 'So11111111111111111111111111111111111111111' ||
      token.toUpperCase() === 'SOL' ||
      token.toUpperCase() === 'WSOL'
    ) {
      return this.getSOLBalance();
    }

    return this.getSPLBalance(token);
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
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  private async getSPLBalance(mintTokenAddress: string) {
    const programId = await this.getTokenProgramId(mintTokenAddress);
    const associatedAccount = getAssociatedTokenAddressSync(
      new PublicKey(mintTokenAddress),
      this.keypair.publicKey,
      false,
      programId,
    );

    const balance =
      await this.connection.getTokenAccountBalance(associatedAccount);
    return balance.value.uiAmount;
  }

  private async isBlockhashExpired(lastValidBlockHeight: number) {
    const currentBlockHeight =
      await this.connection.getBlockHeight('confirmed');
    // console.log('Last Valid Block height - 150:     ', lastValidBlockHeight - 150);
    // console.log('Difference:                      ',currentBlockHeight - (lastValidBlockHeight-150)); // If Difference is positive, blockhash has expired.

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
        console.log(`Transaction Success. Elapsed time: ${elapsed} seconds.`);
        console.log(
          `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        );
        break;
      }

      hashExpired = await this.isBlockhashExpired(lastValidHeight);

      // Break loop if blockhash has expired
      if (hashExpired) {
        const endTime = new Date();
        const elapsed = (endTime.getTime() - startTime.getTime()) / 1000;
        console.log(`Blockhash has expired. Elapsed time: ${elapsed} seconds.`);
        // (add your own logic to Fetch a new blockhash and resend the transaction or throw an error)
        break;
      }

      // Check again after 2.5 sec
      await sleep(checkInterval);
    }
  }
}
