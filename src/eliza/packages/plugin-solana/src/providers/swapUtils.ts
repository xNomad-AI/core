import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import {
  type BlockhashWithExpiryBlockHeight,
  Connection,
  type Keypair,
  PublicKey,
  type RpcResponseAndContext,
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
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function delayedCall<T>(
  method: (...args: any[]) => Promise<T>,
  ...args: any[]
): Promise<T> {
  await delay(150);
  return method(...args);
}

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

export async function getQuote(
  connection: Connection,
  baseToken: string,
  outputToken: string,
  amount: number,
): Promise<any> {
  const decimals = await getTokenDecimals(connection, baseToken);
  const adjustedAmount = amount * 10 ** decimals;

  const quoteResponse = await fetch(
    `https://quote-api.jup.ag/v6/quote?inputMint=${baseToken}&outputMint=${outputToken}&amount=${adjustedAmount}&slippageBps=50`,
  );
  const swapTransaction = await quoteResponse.json();
  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  return new Uint8Array(swapTransactionBuf);
}

export const executeSwap = async (
  transaction: VersionedTransaction,
  type: 'buy' | 'sell',
) => {
  try {
    const latestBlockhash: BlockhashWithExpiryBlockHeight = await delayedCall(
      connection.getLatestBlockhash.bind(connection),
    );
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
    });
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      'confirmed',
    );
    if (confirmation.value.err) {
      elizaLogger.log('Confirmation error', confirmation.value.err);

      throw new Error('Confirmation error');
    } else {
      if (type === 'buy') {
        elizaLogger.log('Buy successful: https://solscan.io/tx/${signature}');
      } else {
        elizaLogger.log('Sell successful: https://solscan.io/tx/${signature}');
      }
    }

    return signature;
  } catch (error) {
    elizaLogger.log(error);
  }
};

export const Sell = async (baseMint: PublicKey, wallet: Keypair) => {
  try {
    const tokenAta = await delayedCall(
      getAssociatedTokenAddress,
      baseMint,
      wallet.publicKey,
    );
    const tokenBalInfo: RpcResponseAndContext<TokenAmount> = await delayedCall(
      connection.getTokenAccountBalance.bind(connection),
      tokenAta,
    );

    if (!tokenBalInfo) {
      elizaLogger.log('Balance incorrect');
      return null;
    }

    const tokenBalance = tokenBalInfo.value.amount;
    if (tokenBalance === '0') {
      elizaLogger.warn(
        `No token balance to sell with wallet ${wallet.publicKey}`,
      );
    }

    const sellTransaction = await getSwapTxWithWithJupiter(
      wallet,
      baseMint,
      tokenBalance,
      'sell',
    );
    // simulate the transaction
    if (!sellTransaction) {
      elizaLogger.log('Failed to get sell transaction');
      return null;
    }

    const simulateResult: RpcResponseAndContext<SimulatedTransactionResponse> =
      await delayedCall(
        connection.simulateTransaction.bind(connection),
        sellTransaction,
      );
    if (simulateResult.value.err) {
      elizaLogger.log('Sell Simulation failed', simulateResult.value.err);
      return null;
    }

    // execute the transaction
    return executeSwap(sellTransaction, 'sell');
  } catch (error) {
    elizaLogger.log(error);
  }
};

export const Buy = async (baseMint: PublicKey, wallet: Keypair) => {
  try {
    const tokenAta = await delayedCall(
      getAssociatedTokenAddress,
      baseMint,
      wallet.publicKey,
    );
    const tokenBalInfo: RpcResponseAndContext<TokenAmount> = await delayedCall(
      connection.getTokenAccountBalance.bind(connection),
      tokenAta,
    );

    if (!tokenBalInfo) {
      elizaLogger.log('Balance incorrect');
      return null;
    }

    const tokenBalance = tokenBalInfo.value.amount;
    if (tokenBalance === '0') {
      elizaLogger.warn(
        `No token balance to sell with wallet ${wallet.publicKey}`,
      );
    }

    const buyTransaction = await getSwapTxWithWithJupiter(
      wallet,
      baseMint,
      tokenBalance,
      'buy',
    );
    // simulate the transaction
    if (!buyTransaction) {
      elizaLogger.log('Failed to get buy transaction');
      return null;
    }

    const simulateResult: RpcResponseAndContext<SimulatedTransactionResponse> =
      await delayedCall(
        connection.simulateTransaction.bind(connection),
        buyTransaction,
      );
    if (simulateResult.value.err) {
      elizaLogger.log('Buy Simulation failed', simulateResult.value.err);
      return null;
    }

    // execute the transaction
    return executeSwap(buyTransaction, 'buy');
  } catch (error) {
    elizaLogger.log(error);
  }
};

export const getSwapTxWithWithJupiter = async (
  wallet: Keypair,
  baseMint: PublicKey,
  amount: string,
  type: 'buy' | 'sell',
) => {
  try {
    switch (type) {
      case 'buy':
        return fetchBuyTransaction(wallet, baseMint, amount);
      case 'sell':
        return fetchSellTransaction(wallet, baseMint, amount);
      default:
        return fetchSellTransaction(wallet, baseMint, amount);
    }
  } catch (error) {
    elizaLogger.log(error);
  }
};

export const fetchBuyTransaction = async (
  wallet: Keypair,
  baseMint: PublicKey,
  amount: string,
) => {
  try {
    const quoteResponse = await (
      await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${solAddress}&outputMint=${baseMint.toBase58()}&amount=${amount}&slippageBps=${SLIPPAGE}`,
      )
    ).json();
    const { swapTransaction } = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 100000,
        }),
      })
    ).json();
    if (!swapTransaction) {
      elizaLogger.log('Failed to get buy transaction');
      return null;
    }

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([wallet]);
    return transaction;
  } catch (error) {
    elizaLogger.log('Failed to get buy transaction', error);
    return null;
  }
};

export const fetchSellTransaction = async (
  wallet: Keypair,
  baseMint: PublicKey,
  amount: string,
) => {
  try {
    const quoteResponse = await (
      await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${baseMint.toBase58()}&outputMint=${solAddress}&amount=${amount}&slippageBps=${SLIPPAGE}`,
      )
    ).json();

    // get serialized transactions for the swap
    const { swapTransaction } = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 52000,
        }),
      })
    ).json();
    if (!swapTransaction) {
      elizaLogger.log('Failed to get sell transaction');
      return null;
    }

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([wallet]);
    return transaction;
  } catch (error) {
    elizaLogger.log('Failed to get sell transaction', error);
    return null;
  }
};

import { createHash } from 'crypto';
import { getRuntimeKey } from '../environment.js';
import { BigNumber } from 'bignumber.js';
import { getWalletKey } from '../keypairUtils.js';
import { getSolanaClient } from './solana-client.js';

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
  connection: Connection,
  walletPublicKey: PublicKey,
  inputTokenCA: string,
  outputTokenCA: string,
  amount: number,
  runtime: IAgentRuntime,
  programId: PublicKey,
): Promise<any> {
  try {
    // Get the decimals for the input token
    const decimals =
      inputTokenCA === getRuntimeKey(runtime, 'SOL_ADDRESS')
        ? new BigNumber(9)
        : new BigNumber(await getTokenDecimals(connection, inputTokenCA));

    elizaLogger.log('Decimals:', decimals.toString());
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

    elizaLogger.info('Quote received');
    elizaLogger.log('Quote received:', quoteData);

    const swapRequestBody = {
      quoteResponse: quoteData,
      userPublicKey: walletPublicKey.toBase58(),
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          global: false,
          // 0.01 SOL
          maxLamports: 10000000,
          priorityLevel: 'veryHigh',
        },
      },
      priorityLevelWithMaxLamports: {
        // 0.01 SOL
        maxLamports: 10000000,
        priorityLevel: 'veryHigh',
      },
    };

    const client = await getSolanaClient(runtime);
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
      const { keypair } = await getWalletKey(runtime, true);
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

    elizaLogger.info('Requesting swap');
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

    elizaLogger.log('Swap transaction received');
    return swapData;
  } catch (error) {
    elizaLogger.error('Error in swapToken:', error);
    throw error;
  }
}
