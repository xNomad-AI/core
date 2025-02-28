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
  Content,
  stringToUuid,
} from '@elizaos/core';
import {
  Connection,
  Keypair,
  RpcResponseAndContext,
  SignatureStatus,
  VersionedTransaction,
} from '@solana/web3.js';
import { getWalletKey } from '../keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminMessage,
} from '../providers/walletUtils.js';
import { convertNullStrings, md5sum, swapToken } from '../providers/swapUtils.js';
import {
  getSwapTokenPrice,
  validateAndAssignCA,
  getTokenCABySymbol,
} from '../providers/tokenUtils.js';
import { getSolanaClient, sleep, SolanaClient } from '../providers/solana-client.js';
import { getRuntimeKey } from '../environment.js';
import { NATIVE_MINT } from '@solana/spl-token';

export const AutoSwapTaskTable = 'AUTO_TOKEN_SWAP_TASK';
export interface AutoSwapTask {
  inputTokenSymbol: string | null;
  outputTokenSymbol: string | null;
  inputTokenCA: string | null;
  outputTokenCA: string | null;
  inputTokenAmount: number | string | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: number | string | null;
  delay: string | null;
  startAt: Date | null;
  expireAt: Date;
  priceCondition: 'below' | 'above' | 'null' | null;
  priceTarget: number | 'null' | null;
  tokenTarget: string | null;
}

const autoSwapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use \`null\` for any values that cannot be determined.

Example response:
\`\`\`json
{
    "inputTokenSymbol": "SOL",
    "outputTokenSymbol": "ELIZA",
    "inputTokenCA": "So11111111111111111111111111111111111111112",
    "outputTokenCA": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "inputTokenAmount": 0.1,
    "inputTokenPercentage": 0.1,
    "outputTokenAmount": null,
    "delay": "300s",
    "priceCondition": "below",
    "priceTarget": 0.016543,
    "tokenTarget": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM"
}

{{recentMessages}}

You are an expert on solana token swap. Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token swap:
Input token symbol (the token being sold)
Output token symbol (the token being bought)
Input token contract address (if provided)
Output token contract address (if provided)
Input Amount to swap (number or string)
Input Amount Percentage to swap (number or null)
Output Amount to swap (number or string or null)
Delay (if provided, e.g., “after 5 minutes” → "300s")
Price trigger condition ("below" or "above" or null)
Price target (if provided, should be number or null)
Token target, which token address or symbol of the trigger and price targets to (if provided, should be string or null, default to input token symbol)

**Special Rules:**
- If the user says "buy [token]", it means swapping SOL for that token.
- If the user says "sell [token]", it means swapping that token for SOL.

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    inputTokenSymbol: string | null;
    outputTokenSymbol: string | null;
    inputTokenCA: string | null;
    outputTokenCA: string | null;
    inputTokenAmount: number | string | null;
    inputTokenPercentage: number | null;
    outputTokenAmount: number | string | null;
    delay: string | null;
    startAt: Date | null;
    expireAt: Date;
    priceCondition: 'below' | 'above' | null;
    priceTarget: number  | null;
    tokenTarget: string | null;
}
\`\`\`

# Examples: 
1. Create an automatic task to buy 74SBV4zDXxTRgv1pEMoECskKBkZHc2yGPnc7GYVepump with 0.0001 SOL when the token price is below 0.1
The response should be
{
  "inputTokenSymbol": "SOL",
  "inputTokenCA": null,
  "outputTokenCA": "74SBV4zDXxTRgv1pEMoECskKBkZHc2yGPnc7GYVepump",
  "outputTokenSymbol": null,
  "inputTokenAmount": 0.0001,
  "inputTokenPercentage": null,
  "outputTokenAmount": null,
  "delay": null,
  "startAt": null,
  "expireAt": null,
  "priceCondition": "below",
  "priceTarget": 0.1,
  "tokenTarget": "74SBV4zDXxTRgv1pEMoECskKBkZHc2yGPnc7GYVepump"
}
2. Create an automatic task to buy ai16z with 0.0001 SOL when the token price is below $1.
The response should be 
{
  "priceTarget": "1"
  "priceCondition": "below",
  "tokenTarget": "ai16z",
  "expireAt": null,
  "startAt": null,
  "delay": null,
  "inputTokenAmount": "0.01",
  "outputTokenCA": null,
  "inputTokenCA": null,
  "outputTokenSymbol": "ai16z",
  "inputTokenSymbol": "SOL",
} 
3. auto sell 1000 ai16z to SOL when the token price is above $1.
The response should be 
{
  "priceTarget": "1"
  "priceCondition": "above",
  "tokenTarget": ai16z,
  "expireAt": null,
  "startAt": null,
  "delay": null,
  "inputTokenAmount": 1000,
  "outputTokenCA": null,
  "inputTokenCA": null,
  "outputTokenSymbol": "SOL",
  "inputTokenSymbol": "ai16z",
} 
4. auto sell 20% of ai16z to SOL when the token price is above $1.
The response should be 
{
  "priceTarget": "1"
  "priceCondition": "above",
  "tokenTarget": "ai16z",
  "expireAt": null,
  "startAt": null,
  "delay": null,
  "inputTokenAmount": null,
  "inputTokenPercentage": 0.2,
  "outputTokenCA": null,
  "inputTokenCA": null,
  "outputTokenSymbol": "SOL",
  "inputTokenSymbol": "ai16z",
}
4. auto sell 100% of ai16z when SOL price is under $135.
The response should be
{
  "priceTarget": "135"
  "priceCondition": "below",
  "tokenTarget": "SOL",
  "expireAt": null,
  "startAt": null,
  "delay": null,
  "inputTokenAmount": null,
  "inputTokenPercentage": 1,
  "outputTokenCA": null,
  "inputTokenCA": null,
  "outputTokenSymbol": "SOL",
  "inputTokenSymbol": "ai16z",
}
`;

const userConfirmAutoTaskTemplate = `
{{recentMessages}}

Analyzing the user’s response to the transfer confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
Consider the latest messages from the conversation history above. Determine the user's response status regarding the confirmation.
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

**Confirmation Criteria:**  
- \`"confirmed"\` → The user has explicitly confirmed using words like **"yes"**, **"confirm"**, **"okay"**, **"sure"**, or similar.  
- \`"rejected"\` → The user responded with anything other than a confirmation after User2 send confirmation message.
- \`"pending"\` → The user has provided a complete autotask request, but User2 has not yet sent the confirmation prompt.  

**Additional Rules:**  
•If the user issues a new instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

 **Should return \`"confirmed"\`**  
- User2: "AutoTask:: Swap 0.00001 SOL for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v when price below 0.99.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "AutoTask:: Swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price below 0.016543.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "okay"  

 **Should return \`"rejected"\`**  
- User2: "AutoTask: Swap 0.00001 SOL for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v when price below 0.99.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "hmm..."  

- User2: "AutoTask:: Swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price below 0.016543.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "no"  

 **Should return \`"pending"\`**  
- User1: "create autotask swap 0.0001 SOL for USDC when price below 0.99"  
`;

export async function executeAutoTokenSwapTask(
  runtime: IAgentRuntime,
  memory: Memory,
) {
  const { id } = memory;
  let content: Content;
  // check content type
  if (typeof content === 'string') {
    content = JSON.parse(content);
  } else {
    content = memory.content;
  }
  // do not remove!
  if (typeof content === 'string') {
    content = JSON.parse(content);
  } else {
    content = memory.content;
  }

  const task = content.task as AutoSwapTask;
  elizaLogger.log('executeAutoTokenSwapTask', content, id);

  if (task.expireAt && new Date(task.expireAt).getTime() <= Date.now()) {
    elizaLogger.info(`Task has expired ${id}`);
    await runtime.databaseAdapter.removeMemory(id, 'AUTO_TOKEN_SWAP_TASK');
  }

  if (task.startAt && new Date(task.startAt).getTime() > Date.now()) {
    elizaLogger.info('Task is not ready to start yet');
    return;
  }


  if (
    task.priceTarget &&
    task.priceCondition &&
    task.priceCondition !== 'null' &&
    task.priceTarget !== 'null'
  ) {
    const tokenCA = task.tokenTarget || (task.priceCondition === 'below' ? task.outputTokenCA : task.inputTokenCA);
    const tokenPrice = await getSwapTokenPrice(runtime, tokenCA);
    const tokenPriceMatched =
      task.priceCondition === 'below'
        ? tokenPrice && tokenPrice < Number(task.priceTarget)
        : tokenPrice && tokenPrice > Number(task.priceTarget);
    if (!tokenPriceMatched) {
      elizaLogger.info(
        `Token price not matched ${id}, price: ${tokenPrice}, expected: ${task.priceTarget}`,
      );
      return;
    }
  }

  await runtime.databaseAdapter.removeMemory(id, AutoSwapTaskTable);
  const { keypair } = await getWalletKey(runtime, true);
  const txId = await executeSwapTokenTx(
    runtime,
    keypair,
    task.inputTokenCA,
    task.outputTokenCA,
    Number(task.inputTokenAmount),
  );
  elizaLogger.info(
    `AUTO_TOKEN_SWAP_TASK Finished successfully ${id}, txId: ${txId}`,
  );
}

export const autoTask: Action = {
  name: 'AUTO_TASK',
  similes: [
    'AUTO_BUY_TOKEN_TASK',
    'AUTO_SELL_TOKEN_TASK',
    'AUTO_SWAP_TOKEN_TASK',
  ],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return await isAgentAdmin(runtime, message);
  },
  description:
    'Perform auto token swap. Enables the agent to automatically execute trades when specified conditions are met, such as limit orders, scheduled transactions, or other custom triggers, optimizing trading strategies without manual intervention.',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<boolean> => {
    const task = await checkResponse(
      runtime,
      message,
      state,
      _options,
      callback,
    );
    if (!task) {
      return true;
    }
    try {
      const content: Content = {
        ...message.content,
        task: task,
      };
      const memory: Memory = {
        id: stringToUuid(md5sum(JSON.stringify(content))),
        agentId: runtime.agentId,
        content: content,
        roomId: stringToUuid(AutoSwapTaskTable),
        userId: message.userId,
      };
      await runtime.databaseAdapter.createMemory(
        memory,
        AutoSwapTaskTable,
        true,
      );
      elizaLogger.info(`AUTO_Task Created, ${JSON.stringify(task)}`);
      const responseMsg = {
        text: `AutoTask Created Successfully`,
      };
      callback?.(responseMsg);
      return true;
    } catch (error) {
      elizaLogger.error(`Error during autotask create:, ${error}`);
      const responseMsg = {
        text: `Emm... something went wrong, please try again later`,
      };
      callback?.(responseMsg);
      return true;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          inputTokenSymbol: 'SOL',
          inputTokenCA: 'So11111111111111111111111111111111111111112',
          outputTokenSymbol: 'USDC',
          outputTokenCA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          inputTokenAmount: 0.1,
          priceCondition: 'below',
          priceTarget: 0.99,
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: "Please confirm the autotask by replying with 'yes' or 'confirm'.",
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
          text: 'AutoTask Created',
        },
      },
    ],
    // Add more examples as needed
  ] as ActionExample[][],
} as Action;


async function checkResponse(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback,
): Promise<AutoSwapTask | null> {
  // check if the swap request is from agent owner or public chat
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
    template: autoSwapTemplate,
  });

  // generate formatted response from chat
  let swapReq = await generateObjectDeprecated({
    runtime,
    context: swapContext,
    modelClass: ModelClass.LARGE,
  }) as AutoSwapTask;
  swapReq = convertNullStrings(swapReq);
  swapReq.inputTokenPercentage = Number(swapReq.inputTokenPercentage);
  swapReq.inputTokenAmount = Number(swapReq.inputTokenAmount);

  elizaLogger.log(`Response:`, swapReq);

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
      action: 'AUTO_TASK',
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

  if (!swapReq.priceTarget && !swapReq.delay) {
    const responseMsg = {
      text: "If you’d like to create an autotask, please specify the target price for the swap or provide a time delay, such as 'after 5 minutes' or 'below 0.00169' ",
    };
    callback?.(responseMsg);
    return null;
  }

  if (swapReq.delay) {
    const getSecondsValue = (value: string): number | null => {
      const match = value.match(/^(\d+)s$/);
      return match ? parseInt(match[1], 10) : null;
    };
    const seconds = getSecondsValue(swapReq.delay);
    swapReq.startAt = new Date(Date.now() + seconds);
  } else {
    swapReq.startAt = new Date();
  }

  swapReq.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  elizaLogger.info(`checking if user confirm to create task`);

  const confirmContext = composeContext({
    state,
    template: userConfirmAutoTaskTemplate,
  });

  const confirmResponse = await generateObjectDeprecated({
    runtime,
    context: confirmContext,
    modelClass: ModelClass.LARGE,
  });
  elizaLogger.info(`User confirm check: ${JSON.stringify(confirmResponse)}`);

  if (confirmResponse.userAcked == 'rejected') {
    const responseMsg = {
      text: 'ok. I will not set the autotask.',
    };
    callback?.(responseMsg);
    return null;
  }

  if (confirmResponse.userAcked == 'pending') {
    const swapInfo = formatTaskInfo(swapReq);
    const responseMsg = {
      text: `${swapInfo}
✅ Please confirm by replying with 'yes' or 'ok'.If I’m wrong, feel free to correct me directly.`,
      action: 'AUTO_TASK',
    };
    callback?.(responseMsg);
    return null;
  }

  return swapReq;
}

async function executeSwapTokenTx(
  runtime: IAgentRuntime,
  keypair: Keypair,
  inputTokenCA: string,
  outputTokenCA: string,
  amount: number,
) {
  elizaLogger.info(
    `swapToken ${keypair.publicKey.toBase58()} : ${inputTokenCA} for ${outputTokenCA} amount: ${amount}`,
  );
  const rpcUrl = getRuntimeKey(runtime, 'SOLANA_RPC_URL');
  const connection = new Connection(rpcUrl);
  const solanaClient = new SolanaClient(rpcUrl, keypair);
  const programId = await solanaClient.getTokenProgramId(inputTokenCA);
  const swapResult = await swapToken(
    connection,
    keypair.publicKey,
    inputTokenCA as string,
    outputTokenCA as string,
    amount as number,
    runtime,
    programId,
  );

  const transactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(transactionBuf);
  transaction.sign([keypair]);
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
      break;
    }
  }
  elizaLogger.log(`Swap completed successfully! Transaction ID: ${txid}`);
  return txid;
}

function formatTaskInfo(params: AutoSwapTask): string {
  let trigger = '';
  if (
    params.priceCondition &&
    params.priceTarget &&
    params.priceCondition !== 'null' &&
    params.priceTarget !== 'null'
  ) {
    trigger = `when $${params.tokenTarget || params.inputTokenSymbol || params.inputTokenCA} price is ${params.priceCondition} ${params.priceTarget}`;
  }
  if (params.startAt) {
    trigger += `\nstart at: ${JSON.stringify(params.startAt)}`;
  }
  trigger += `\nexpire at: ${JSON.stringify(params.expireAt)}`;

  return `
💱 Auto Task:
----------------------------
🔹 From: ${params.inputTokenAmount} ${params.inputTokenSymbol}  
   📌 CA: ${params.inputTokenCA}

🔸 To: ${params.outputTokenSymbol}  
   📌 CA: ${params.outputTokenCA}
   
   Condition: ${trigger}
----------------------------
  `;
}
