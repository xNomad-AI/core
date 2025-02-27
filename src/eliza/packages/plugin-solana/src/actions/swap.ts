import {
  type ActionExample,
  composeContext,
  generateObjectDeprecated,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelClass,
  type State,
  type Action,
  elizaLogger,
} from '@elizaos/core';
import {
  Connection,
  PublicKey,
  RpcResponseAndContext,
  SignatureStatus,
  VersionedTransaction,
} from '@solana/web3.js';
import { getWalletKey } from '../keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminMessage,
} from '../providers/walletUtils.js';
import { convertNullStrings, swapToken } from '../providers/swapUtils.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { getSolanaClient, sleep } from '../providers/solana-client.js';
import { getTokenCABySymbol, validateAndAssignCA } from '../providers/tokenUtils.js';
import { getRuntimeKey } from '../environment.js';

interface SwapTokenRequest {
  inputTokenSymbol: string;
  inputTokenCA: string;
  outputTokenSymbol: string;
  outputTokenCA: string;
  inputTokenAmount: number | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: number | null;
}

const swapTemplate = `
Example response:
\`\`\`json
{
    "inputTokenSymbol": "SOL",
    "outputTokenSymbol": "USDC",
    "inputTokenCA": "So11111111111111111111111111111111111111112",
    "outputTokenCA": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "inputTokenAmount": 0.02,
    "inputTokenPercentage": "100%",
    "outputTokenAmount": null
}
\`\`\`

{{recentMessages}}

You are an expert on solana token swaps. Given the recent messages above:

Extract the following information about the requested token swap:
- Input token symbol (the token being sold)
- Output token symbol (the token being bought)
- Input token contract address if provided
- Output token contract address if provided
- Input token amount
- Input token percentage, sell all means percentage is 1
- Output token amount

Ensure you only extract the current swap request from the user, and avoid extracting any historical swap messages.

**Special Rules:**
- If the user says "buy [token]", it means swapping SOL for that token.
- If the user says "sell [token]", it means swapping that token for SOL.

The Token contract address (aka CA) should be a 44 character string, for example: [EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v], [7Xu2oddJ3DMQ1UdgoC8ewK6Kq73kcXUcYCcnfzxqpump]
Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "inputTokenSymbol": string | null,
    "outputTokenSymbol": string | null,
    "inputTokenCA": string | null,
    "outputTokenCA": string | null,
    "inputTokenAmount": number | string,
    "inputTokenPercentage": number | null,
    "outputTokenAmount": number | null
}
\`\`\`

Examples:
-  buy 100 ai16z should return \`{"inputTokenSymbol": "SOL", "outputTokenSymbol": "ai16z", "inputTokenCA": null, "outputTokenCA": null, "outputTokenAmount": 100}\`;
-  buy 0.1 SOL ELIZA should return \`{"inputTokenSymbol": "SOL", "outputTokenSymbol": "ELIZA", "inputTokenCA": null, "outputTokenCA": null, "amount": 0.1}\`;
-  buy ai16z with 0.001 SOL should return \`{"inputTokenSymbol": "SOL", "outputTokenSymbol": "ai16z", "inputTokenCA": null, "outputTokenCA": null, "amount": 0.001}\`;
-  sell 1 USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v should return \`{"inputTokenSymbol": "USDC", "outputTokenSymbol": "SOL", "inputTokenCA": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "outputTokenCA": null, "inputTokenAmount": 1}\`;
-  swap 0.1 SOL for USDC should return \`{"inputTokenSymbol": "SOL", "outputTokenSymbol": "USDC", "inputTokenCA": null, "outputTokenCA": null, "amount": 0.1}\`;
-  swap 20 ai16z for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v should return \`{"inputTokenSymbol": "ai16z", "outputTokenSymbol": "USDC", "inputTokenCA": null, "outputTokenCA": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "inputTokenAmount": 20}\`;
-  sell all ELIZA should return \`{"inputTokenSymbol": "ELIZA", "outputTokenSymbol": "SOL", "inputTokenCA": null, "outputTokenCA": null, "inputTokenPercentage": 1}\`;
-  sell 50% ELIZA should return \`{"inputTokenSymbol": "ELIZA", "outputTokenSymbol": "SOL", "inputTokenCA": null, "outputTokenCA": null, "inputTokenPercentage": 0.5}\`;
`;

const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user’s response to the transfer confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
Consider the latest messages from the conversation history above. Determine the user's response status regarding the confirmation.
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

**Decision Criteria:**  
"confirmed" → The user has explicitly confirmed the swap using words like “yes”, “confirm”, “okay”, “sure”, etc.
"rejected" → The user has responded with anything other than a confirmation.
"pending" → The user has provided a complete swap request, but User2 has not yet sent the confirmation prompt.

**Additional Rules:**  
•If the user issues a new instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Swap 0.0001 SOL for USDC. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Swap 0.1 SOL for ELIZA. Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Swap 0.0001 SOL for USDC. Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

- User1: "buy 0.1 SOL ELIZA"  
- User2: "Swap 0.1 SOL for ELIZA. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "cancel"  

❓ **Should return \`"pending"\`**  
- User1: "swap 0.0001 SOL for USDC"  

- User1: "buy 0.1 SOL ELIZA"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;

export const executeSwap: Action = {
  name: 'EXECUTE_SWAP',
  suppressInitialMessage: true,
  similes: [
    'SWAP_TOKENS',
    'TOKEN_SWAP',
    'TRADE_TOKENS',
    'EXCHANGE_TOKENS',
    'BUY_TOKENS',
    'SELL_TOKENS',
  ],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return await isAgentAdmin(runtime, message);
  },
  description:
    'Perform a token swap. buy or sell tokens, supports SOL and SPL tokens swaps.',
  handler: handleExecuteSwap,
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          inputTokenSymbol: 'SOL',
          inputTokenCA: 'So11111111111111111111111111111111111111112',
          outputTokenSymbol: 'USDC',
          outputTokenCA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: 0.1,
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Swap Request:--- swap 0.1 SOL for USDC -----, please confirm by replying with "yes" or "ok"',
        },
      },
      {
        user: '{{user1}}',
        content: {
          text: 'yes',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Swap completed successfully! Transaction ID: ...',
        },
      },
    ],
    // Add more examples as needed
  ] as ActionExample[][],
} as Action;

async function handleExecuteSwap(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback,
): Promise<boolean> {
  const response = await checkResponse(
    runtime,
    message,
    state,
    _options,
    callback,
  );
  if (!response) {
    return true;
  }

  const rpcUrl = getRuntimeKey(runtime, 'SOLANA_RPC_URL');
  const connection = new Connection(rpcUrl);
  const { keypair } = await getWalletKey(runtime, true);
  const walletPublicKey = keypair.publicKey;

  const swapResult = await swapToken(
    connection,
    walletPublicKey,
    response.inputTokenCA,
    response.outputTokenCA,
    response.inputTokenAmount,
    runtime,
    response.programId,
  );

  const transactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(transactionBuf);
  transaction.sign([keypair]);
  elizaLogger.log('Sending transaction...');

  let txid: string;
  try {
    txid = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });
  } catch (error) {
    elizaLogger.warn('Error sending transaction:', error);
    throw error;
  }

  elizaLogger.log('Transaction sent:', txid);

  let confirmation: RpcResponseAndContext<SignatureStatus | null>;

  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    confirmation = await connection.getSignatureStatus(txid, {
      searchTransactionHistory: false,
    });

    if (confirmation.value) {
      break;
    }
  }

  elizaLogger.log(`Swap completed successfully! Transaction ID: ${txid}`);

  const responseMsg = {
    text: `Swap completed successfully! Transaction ID: ${txid}`,
  };
  callback?.(responseMsg);
  return true;
}

async function checkResponse(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback,
): Promise<{
  inputTokenCA: string;
  outputTokenCA: string;
  inputTokenAmount: number;
  programId: PublicKey;
} | null> {
  const isAdmin = await isAgentAdmin(runtime, message);
  if (!isAdmin) {
    const responseMsg = {
      text: NotAgentAdminMessage,
    };
    callback?.(responseMsg);
    return null;
  }

  const swapContext = composeContext({
    state,
    template: swapTemplate,
  });

  // generate formatted response from chat
  let swapReq = await generateObjectDeprecated({
    runtime,
    context: swapContext,
    modelClass: ModelClass.LARGE,
  }) as SwapTokenRequest;
  swapReq = convertNullStrings(swapReq);
  swapReq.inputTokenPercentage = Number(swapReq.inputTokenPercentage);
  swapReq.inputTokenAmount = Number(swapReq.inputTokenAmount);
  swapReq.outputTokenAmount = Number(swapReq.outputTokenAmount);

  elizaLogger.info(`Prompt: ${swapContext}, Response:`, swapReq);

  if (swapReq.inputTokenSymbol?.toUpperCase() === 'SOL') {
    swapReq.inputTokenCA = getRuntimeKey(runtime, 'SOL_ADDRESS');
  }
  if (swapReq.outputTokenSymbol?.toUpperCase() === 'SOL') {
    swapReq.outputTokenCA = getRuntimeKey(runtime, 'SOL_ADDRESS');
  }
  swapReq.inputTokenCA = validateAndAssignCA(swapReq.inputTokenSymbol, swapReq.inputTokenCA);
  swapReq.outputTokenCA = validateAndAssignCA(swapReq.outputTokenSymbol, swapReq.outputTokenCA);

  if (!swapReq.inputTokenCA) {
    swapReq.inputTokenCA = await getTokenCABySymbol(runtime, swapReq.inputTokenSymbol);
    if (!swapReq.inputTokenCA){
      const responseMsg = {
        text: 'Please provide a valid inputToken CA you want to sell',
      };
      callback?.(responseMsg);
      return null;
    }
  }

  if (!swapReq.outputTokenCA) {
    swapReq.outputTokenCA = await getTokenCABySymbol(runtime, swapReq.outputTokenSymbol);
    if (!swapReq.outputTokenCA){
      const responseMsg = {
        text: 'Please provide a valid outputToken CA you want to buy',
      };
      callback?.(responseMsg);
      return null;
    }
  }

  const client = await getSolanaClient(runtime);
  const programId = await client.getTokenProgramId(swapReq.inputTokenCA);

  if (Number.isFinite((swapReq.outputTokenAmount)) && swapReq.outputTokenAmount != 0){
    callback?.({
      text: `Specify the buy amount of a token is not supported now, ${swapReq.outputTokenAmount} will be ignored.`,
    })
  }

  if (Number.isFinite(swapReq.inputTokenPercentage) && swapReq.inputTokenPercentage != 0){
    const balance = await client.getBalance(swapReq.inputTokenCA);
    swapReq.inputTokenAmount = balance * swapReq.inputTokenPercentage;
  }

  if (!Number.isFinite((swapReq.inputTokenAmount)) || swapReq.inputTokenAmount <= 0) {
    const responseMsg = {
      text: `Please provide a valid ${swapReq.inputTokenSymbol} input amount or output amount to perform the swap`,
      action: 'EXECUTE_SWAP',
    };
    callback?.(responseMsg);
    return null;
  }

  const balance = await client.getBalance(swapReq.inputTokenCA);
  if (!balance){
    const responseMsg = {
      text: 'Your input balance is 0.',
    };
    callback?.(responseMsg);
  }

  if (balance < swapReq.inputTokenAmount) {
    const responseMsg = {
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${balance} available.`
    };
    callback?.(responseMsg);
    return null;
  }

  const WSOL_AMOUNT = await client.getBalance(NATIVE_MINT.toBase58());
  const GAS_BANANCE = 0.001;   // require 0.001 SOL for gas fee

  if (swapReq.inputTokenCA !== NATIVE_MINT.toBase58()) {
    // buy with token
    const balance = await client.getBalance(NATIVE_MINT.toBase58());
    if (balance < GAS_BANANCE) {
      elizaLogger.error('Insufficient balance for swap gas fee');
      const responseMsg = {
        text:
          `Insufficient balance for swap gas fee, required: ${GAS_BANANCE} SOL but only have: ` +
          balance,
      };
      callback?.(responseMsg);
      return null;
    }
  } else if (WSOL_AMOUNT - swapReq.inputTokenAmount < GAS_BANANCE) {
    // buy with SOL
    const requiredAmount = GAS_BANANCE + Number(swapReq.inputTokenAmount);
    elizaLogger.error('Insufficient balance for swap gas fee');
    const responseMsg = {
      text:
        `Insufficient balance for swap gas fee, required: ${requiredAmount} SOL but only have: ` +
        WSOL_AMOUNT,
    };
    callback?.(responseMsg);
    return null;
  }

  elizaLogger.info(`checking if user confirm to execute swap`);

  const confirmContext = composeContext({
    state,
    template: userConfirmTemplate,
  });

  const confirmResponse = await generateObjectDeprecated({
    runtime,
    context: confirmContext,
    modelClass: ModelClass.LARGE,
  });
  elizaLogger.info(`User confirm check: ${JSON.stringify(confirmResponse)}`);

  if (confirmResponse.userAcked == 'rejected') {
    const responseMsg = {
      text: 'ok. I will not execute this transaction.',
    };
    callback?.(responseMsg);
    return null;
  }

  if (confirmResponse.userAcked == 'pending') {
    const swapInfo = formatSwapInfo({
      inputTokenSymbol: swapReq.inputTokenSymbol,
      inputTokenCA: swapReq.inputTokenCA,
      outputTokenSymbol: swapReq.outputTokenSymbol,
      outputTokenCA: swapReq.outputTokenCA,
      inputTokenAmount: swapReq.inputTokenAmount,
    });
    const responseMsg = {
      text: `${swapInfo}
✅ Please confirm the swap by replying with 'yes' or 'ok'.If I’m wrong, feel free to correct me directly.`,
      action: 'EXECUTE_SWAP',
    };
    callback?.(responseMsg);
    return null;
  }

  return { ...swapReq, programId };
}

function formatSwapInfo(params: {
  inputTokenSymbol: string;
  inputTokenCA: string;
  outputTokenSymbol: string;
  outputTokenCA: string;
  inputTokenAmount: number;
}): string {
  return `
💱 Swap Request
----------------------------
🔹 Input: ${params.inputTokenAmount} ${params.inputTokenSymbol}  
   📌 CA: ${params.inputTokenCA}

🔸 Output: ${params.outputTokenSymbol}  
   📌 CA: ${params.outputTokenCA}
----------------------------
  `;
}
