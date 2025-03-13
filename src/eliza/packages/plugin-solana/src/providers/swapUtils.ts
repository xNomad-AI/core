import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount, NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import {
  type BlockhashWithExpiryBlockHeight,
  Connection,
  type Keypair, LAMPORTS_PER_SOL,
  PublicKey,
  type RpcResponseAndContext, SignatureStatus,
  type SimulatedTransactionResponse,
  type TokenAmount,
  VersionedTransaction,
} from '@solana/web3.js';
import { settings, elizaLogger, IAgentRuntime } from '@elizaos/core';

const solAddress = settings.SOL_ADDRESS;
const SLIPPAGE = settings.SLIPPAGE;
const connection = new Connection(
  settings.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
);

export async function getTokenDecimals(
  connection: Connection,
  mintAddress: string,
): Promise<number> {
  const mintPublicKey = new PublicKey(mintAddress);
  const tokenAccountInfo = await connection.getParsedAccountInfo(mintPublicKey);

  // Check if the data is parsed and contains the expected structure
  if (
    tokenAccountInfo.value &&
    typeof tokenAccountInfo.value.data === 'object' &&
    'parsed' in tokenAccountInfo.value.data
  ) {
    const parsedInfo = tokenAccountInfo.value.data.parsed?.info;
    if (parsedInfo && typeof parsedInfo.decimals === 'number') {
      return parsedInfo.decimals;
    }
  }

  throw new Error('Unable to fetch token decimals');
}


import { createHash } from 'crypto';
import { getRuntimeKey } from '../environment.js';
import { BigNumber } from 'bignumber.js';
import { getWalletKey } from '../keypairUtils.js';
import { getSolanaClient, sleep, SolanaClient } from './solana-client.js';

export function md5sum(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

// convert null strings to null
export function convertNullStrings(obj) {
  for (const key in obj) {
    if (obj[key] === 'null') {
      obj[key] = null;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertNullStrings(obj[key]);
    }
  }
  return obj;
}

const DEFAULT_CONFIG = {
  JUP_SWAP_FEE_ACCOUNT: '5o5pzvdWLieWQ5JumkbsSgDn7ME69ewnx76VUnb4x3sd',
  JUP_SWAP_FEE_BPS: 100,
};

function getJUP_SWAP_FEE_BPS() {
  return settings.JUP_SWAP_FEE_BPS || DEFAULT_CONFIG.JUP_SWAP_FEE_BPS;
}

function getJUP_SWAP_FEE_ACCOUNT() {
  const ret =
    settings.JUP_SWAP_FEE_ACCOUNT || DEFAULT_CONFIG.JUP_SWAP_FEE_ACCOUNT;
  return ret;
}

export async function swapToken(
  {
   connection, inputTokenCA, keypair, amount, outputTokenCA, programId, tip, priorityFee, slippage,
  }:{
    connection: Connection,
    inputTokenCA: string,
    outputTokenCA: string,
    amount: number,
    programId: PublicKey,
    keypair: Keypair,
    tip?: number,
    priorityFee?: number,
    slippage?: number,
  }
): Promise<any> {
  try {
    const walletPublicKey = keypair.publicKey;
    // Get the decimals for the input token
    const decimals =
      inputTokenCA === NATIVE_MINT.toBase58()
        ? new BigNumber(9)
        : new BigNumber(await getTokenDecimals(connection, inputTokenCA));

    const amountBN = new BigNumber(amount);
    let adjustedAmount = amountBN.multipliedBy(new BigNumber(10).pow(decimals));

    if (!adjustedAmount.isInteger()) {
      elizaLogger.warn(
        `Amount ${adjustedAmount} is not an integer, rounding down`,
      );
      adjustedAmount = adjustedAmount.integerValue(BigNumber.ROUND_DOWN);
    }

    elizaLogger.info('Fetching quote with params:', {
      inputMint: inputTokenCA,
      outputMint: outputTokenCA,
      amount: adjustedAmount,
    });

    // auto slippage
    let url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputTokenCA}&outputMint=${outputTokenCA}&amount=${adjustedAmount}&dynamicSlippage=true&autoSlippage=true&maxAccounts=64&onlyDirectRoutes=false&asLegacyTransaction=false`;
    if (
      getJUP_SWAP_FEE_BPS() !== undefined &&
      getJUP_SWAP_FEE_ACCOUNT() !== undefined
    ) {
      url += `&platformFeeBps=${getJUP_SWAP_FEE_BPS()}`;
    }

    const quoteResponse = await fetch(url);
    const quoteData = await quoteResponse.json();

    if (!quoteData || quoteData.error) {
      elizaLogger.error('Quote error:', quoteData);
      throw new Error(
        `Failed to get quote: ${quoteData?.error || 'Unknown error'}`,
      );
    }

    elizaLogger.log('Quote received:', quoteData);

    const swapRequestBody: any = {
      quoteResponse: quoteData,
      userPublicKey: walletPublicKey.toBase58(),
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          global: false,
          maxLamports: (priorityFee || 0) * LAMPORTS_PER_SOL,
          priorityLevel: 'veryHigh',
        },
      },
    };

    if (slippage){
      swapRequestBody.slippageBps = Math.round(slippage * 100);
    }else{
      swapRequestBody.dynamicComputeUnitLimit = true;
      swapRequestBody.dynamicSlippage = true;
    }

    const client = new SolanaClient(connection.rpcEndpoint, walletPublicKey);
    const outProgramId = await client.getTokenProgramId(quoteData.outputMint);
    // get or create fee token account after check to prevent invalid token account creation
    // only add fee account if the token is not a 2022 token
    // https://station.jup.ag/docs/swap-api/add-fees-to-swap#important-notes
    if (
      getJUP_SWAP_FEE_BPS() !== undefined &&
      getJUP_SWAP_FEE_ACCOUNT() !== undefined &&
      !programId.equals(TOKEN_2022_PROGRAM_ID) &&
      !outProgramId.equals(TOKEN_2022_PROGRAM_ID)
    ) {
      elizaLogger.log(
        'get or creating fee account:',
        getJUP_SWAP_FEE_ACCOUNT(),
        programId.toBase58(),
      );
      const FEE_ACCOUNT_INPUT_MINT_ACCOUNT = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          keypair,
          new PublicKey(quoteData.inputMint),
          new PublicKey(getJUP_SWAP_FEE_ACCOUNT()),
          true,
          undefined,
          undefined,
          programId,
        )
      ).address;

      swapRequestBody['feeAccount'] = FEE_ACCOUNT_INPUT_MINT_ACCOUNT.toBase58();
    }

    elizaLogger.log('Requesting swap with body:', swapRequestBody);

    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(swapRequestBody),
    });

    const swapData = await swapResponse.json();

    if (!swapData || !swapData.swapTransaction) {
      elizaLogger.error(`Swap error:, ${JSON.stringify(swapData)}`);
      throw new Error(
        `Failed to get swap transaction: ${swapData?.error || 'No swap transaction returned'}`,
      );
    }

    const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuf);
    if (tip && tip > 0) {

    }
    transaction.sign([keypair]);
    return transaction;
  } catch (error) {
    elizaLogger.error('Error in swapToken:', error);
    throw error;
  }
}

export async function submitTransaction(connection: Connection, transaction: VersionedTransaction, options? : {
  antiMev: boolean,
  tip: number,
}) {
  const txid = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'confirmed',
  });
  elizaLogger.log('Transaction sent:', txid);
  let confirmation: RpcResponseAndContext<SignatureStatus | null>;
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    confirmation = await connection.getSignatureStatus(txid, {
      searchTransactionHistory: false,
    });
    if (confirmation.value) {
      elizaLogger.log(`Swap completed successfully! Transaction ID: ${txid}`);
      return txid;
    }
  }

  throw new Error(`Transaction confirmation failed ${txid}`);
}
