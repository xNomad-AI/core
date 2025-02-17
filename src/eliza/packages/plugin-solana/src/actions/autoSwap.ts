import {
  type ActionExample,
  composeContext,
  generateObjectDeprecated,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelClass,
  settings,
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
import { convertNullStrings, md5sum } from './swapUtils.js';
import { isValidSPLTokenAddress, swapToken } from './swap.js';
import { getTokensBySymbol } from '../providers/tokenUtils.js';
import { SolanaClient } from './solana-client.js';
import { getRuntimeKey } from '../environment.js';

export const AutoSwapTaskTable = 'AUTO_TOKEN_SWAP_TASK';
export interface AutoSwapTask {
  inputTokenSymbol: string | null;
  outputTokenSymbol: string | null;
  inputTokenCA: string | null;
  outputTokenCA: string | null;
  amount: number | string | null;
  delay: string | null;
  startAt: Date | null;
  expireAt: Date;
  priceCondition: 'under' | 'over' | 'null' | null;
  priceTarget: number | 'null' | null;
}

const autoSwapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use \`null\` for any values that cannot be determined.

Example response:
\`\`\`json
{
    "inputTokenSymbol": "SOL",
    "outputTokenSymbol": "ELIZA",
    "inputTokenCA": "So11111111111111111111111111111111111111112",
    "outputTokenCA": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "amount": 0.1,
    "delay": "300s",
    "priceCondition": "under",
    "priceTarget": 0.016543
}

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token swap:
Input token symbol (the token being sold)
Output token symbol (the token being bought)
Input token contract address (if provided)
Output token contract address (if provided)
Amount to swap (number or string)
Delay (if provided, e.g., “after 5 minutes” → "300s")
Price trigger condition ("under" or "over" or null)
Price target (if provided, should be number or null)

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    inputTokenSymbol: string | null;
    outputTokenSymbol: string | null;
    inputTokenCA: string | null;
    outputTokenCA: string | null;
    amount: number | string | null;
    delay: string | null;
    startAt: Date | null;
    expireAt: Date;
    priceCondition: 'under' | 'over' | null;
    priceTarget: number  | null;
}
\`\`\`

Examples: 
1. Create an automatic task to buy ai16z with 0.0001 SOL when the token price is under $1.
The response should be 
{
  "priceTarget": "1"
  "priceCondition": "under",
  "expireAt": null,
  "startAt": null,
  "delay": null,
  "amount": "0.01",
  "outputTokenCA": null,
  "inputTokenCA": null,
  "outputTokenSymbol": "ai16z",
  "inputTokenSymbol": "SOL",
} 
2. auto sell 1000 ai16z to SOL when the token price is above $1.
The response should be 
{
  "priceTarget": "1"
  "priceCondition": "over",
  "expireAt": null,
  "startAt": null,
  "delay": null,
  "amount": 1000,
  "outputTokenCA": null,
  "inputTokenCA": null,
  "outputTokenSymbol": "SOL",
  "inputTokenSymbol": "ai16z",
} 
`;

const userConfirmAutoTaskTemplate = `
{{recentMessages}}

Determine the user's confirmation status for creating an autotask.  
Consider only the last three messages from the conversation history above.  
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

**Examples:**  

 **Should return \`"confirmed"\`**  
- User2: "AutoTask:: Swap 0.00001 SOL for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v when price under 0.99.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "AutoTask:: Swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price under 0.016543.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "okay"  

 **Should return \`"rejected"\`**  
- User2: "AutoTask: Swap 0.00001 SOL for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v when price under 0.99.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "hmm..."  

- User2: "AutoTask:: Swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price under 0.016543.  
  Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "no"  

 **Should return \`"pending"\`**  
- User1: "create autotask swap 0.0001 SOL for USDC when price under 0.99"  
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

  if (task.startAt && task.startAt > new Date()) {
    elizaLogger.info('Task is not ready to start yet');
    return;
  }

  if (task.expireAt && task.expireAt <= new Date()) {
    elizaLogger.info(`Task has expired ${id}`);
    await runtime.databaseAdapter.removeMemory(id, 'AUTO_TOKEN_SWAP_TASK');
  }

  if (
    task.priceTarget &&
    task.priceCondition &&
    task.priceCondition !== 'null' &&
    task.priceTarget !== 'null'
  ) {
    const tokenCA =
      task.priceCondition === 'under' ? task.outputTokenCA : task.inputTokenCA;
    const tokenPrice = await getSwapTokenPrice(runtime, tokenCA);
    const tokenPriceMatched =
      task.priceCondition === 'under'
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
    Number(task.amount),
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
    const isAdmin = await isAgentAdmin(runtime, message);
    return isAdmin;
  },
  description: 'Perform auto token swap. Enables the agent to automatically execute trades when specified conditions are met, such as limit orders, scheduled transactions, or other custom triggers, optimizing trading strategies without manual intervention.',
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
          amount: 0.1,
          priceCondition: 'under',
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

async function getSwapTokenPrice(
  runtime: IAgentRuntime,
  tokenCA,
): Promise<number | undefined> {
  try {
    const birdeyeApiKey = getRuntimeKey(runtime, 'BIRDEYE_API_KEY');
    const url = `https://public-api.birdeye.so/defi/price?address=${tokenCA}`;
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': birdeyeApiKey,
        accept: 'application/json',
        'x-chain': 'solana',
      },
    });
    const result = await response.json();
    return result?.data.value;
  } catch (error) {
    elizaLogger.error(`Error fetching token price: ${error}`);
    return undefined;
  }
}

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

  // composeState
  if (!state) {
    state = (await runtime.composeState(message)) as State;
  } else {
    state = await runtime.updateRecentMessageState(state);
  }

  const swapContext = composeContext({
    state,
    template: autoSwapTemplate,
  });

  // generate formatted response from chat
  let response = await generateObjectDeprecated({
    runtime,
    context: swapContext,
    modelClass: ModelClass.LARGE,
  });
  response = convertNullStrings(response);

  elizaLogger.info(`Message: ${message?.content?.text}, Response:`, response);

  // Add SOL handling logic
  if (response.inputTokenSymbol?.toUpperCase() === 'SOL') {
    response.inputTokenCA = settings.SOL_ADDRESS;
  }
  if (response.outputTokenSymbol?.toUpperCase() === 'SOL') {
    response.outputTokenCA = settings.SOL_ADDRESS;
  }

  // check if amount is a number
  if (!response.amount || Number.isNaN(Number(response.amount))) {
    const responseMsg = {
      text: `Please provide a valid ${response.inputTokenSymbol} input amount to perform the swap`,
      action: 'EXECUTE_SWAP',
    };
    callback?.(responseMsg);
    return null;
  }

  let validInputTokenCA = isValidSPLTokenAddress(response.inputTokenCA);
  let validOutputTokenCA = isValidSPLTokenAddress(response.outputTokenCA);
  const validInputTokenSymbol = isValidSPLTokenAddress(
    response.inputTokenSymbol,
  );
  const validOutputTokenSymbol = isValidSPLTokenAddress(
    response.outputTokenSymbol,
  );

  // the CA maybe recognized as symbol, so we need to check if it is a valid CA
  if (validInputTokenSymbol && !validInputTokenCA) {
    response.inputTokenCA = response.inputTokenSymbol;
  }
  if (validOutputTokenSymbol && !validOutputTokenCA) {
    response.outputTokenCA = response.outputTokenSymbol;
  }

  validInputTokenCA = isValidSPLTokenAddress(response.inputTokenCA);
  validOutputTokenCA = isValidSPLTokenAddress(response.outputTokenCA);
  if (!validInputTokenCA) {
    const tokens = await getTokensBySymbol(
      getRuntimeKey(runtime, 'BIRDEYE_API_KEY'),
      response.inputTokenSymbol,
    );
    if (tokens?.[0]?.address) {
      response.inputTokenCA = tokens[0].address;
    } else {
      elizaLogger.log(
        `Invalid input contract address ${response.inputTokenCA}, skipping swap`,
      );
      const responseMsg = {
        text: 'Please provide the inputToken CA you want to sell',
      };
      callback?.(responseMsg);
      return null;
    }
  }

  if (!validOutputTokenCA) {
    const tokens = await getTokensBySymbol(
      getRuntimeKey(runtime, 'BIRDEYE_API_KEY'),
      response.outputTokenSymbol,
    );
    if (tokens?.[0]?.address) {
      response.outputTokenCA = tokens[0].address;
    } else {
      elizaLogger.log(
        `Invalid output contract address ${response.outputTokenCA}, skipping swap`,
      );
      const responseMsg = {
        text: 'Please provide the outputToken CA you want to buy',
      };
      callback?.(responseMsg);
      return null;
    }
  }

  if (!response.priceTarget && !response.delay) {
    const responseMsg = {
      text: "If you’d like to create an autotask, please specify the target price for the swap or provide a time delay, such as 'after 5 minutes' or 'under 0.00169' ",
    };
    callback?.(responseMsg);
    return null;
  }

  if (response.delay) {
    const getSecondsValue = (value: string): number | null => {
      const match = value.match(/^(\d+)s$/);
      return match ? parseInt(match[1], 10) : null;
    };
    const seconds = getSecondsValue(response.delay);
    response.startAt = new Date(Date.now() + seconds);
  } else {
    response.startAt = new Date();
  }

  response.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
    const swapInfo = formatTaskInfo(response);
    const responseMsg = {
      text: `
                ${swapInfo}
✅ Please confirm the swap by replying with 'yes' or 'ok'.
                `,
      action: 'EXECUTE_SWAP',
    };
    callback?.(responseMsg);
    return null;
  }

  return response;
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

  elizaLogger.info('Deserializing transaction...');
  const transactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(transactionBuf);

  elizaLogger.log('Signing transaction...');
  transaction.sign([keypair]);
  elizaLogger.log('Sending transaction...');

  const txid = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'confirmed',
  });

  elizaLogger.log('Transaction sent:', txid);

  let confirmation: RpcResponseAndContext<SignatureStatus | null>;

  // wait for 20s for the transaction to be processed
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    confirmation = await connection.getSignatureStatus(txid, {
      searchTransactionHistory: false,
    });

    if (confirmation.value) {
      break;
    }
  }

  elizaLogger.log('Swap completed successfully!');
  elizaLogger.log(`Transaction ID: ${txid}`);
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
    trigger = `when price is ${params.priceCondition} ${params.priceTarget}`;
  }
  if (params.startAt) {
    trigger += `\nstart at: ${JSON.stringify(params.startAt)}`;
  }
  trigger += `\nexpire at: ${JSON.stringify(params.expireAt)}`;

  return `
💱 Auto Task:
----------------------------
🔹 From: ${params.amount} ${params.inputTokenSymbol}  
   📌 CA: ${params.inputTokenCA}

🔸 To: ${params.outputTokenSymbol}  
   📌 CA: ${params.outputTokenCA}
   
   Condition: ${trigger}
----------------------------
  `;
}
