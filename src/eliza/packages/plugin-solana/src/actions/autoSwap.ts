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
  Keypair, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getWalletKey } from '../keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import {
  convertNullStrings, getTradeSettings,
  md5sum,
  submitTransaction,
  swapToken,
} from '../providers/swapUtils.js';
import {
  getSwapTokenPrice,
  validateAndAssignCA,
  getTokenCABySymbol,
  isValidSPLTokenAddress,
  trimTokenSymbol,
} from '../providers/tokenUtils.js';
import {
  getSolanaClient,
  SolanaClient,
} from '../providers/solanaClient.js';
import { getRuntimeKey } from '../environment.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { SwapTokenService } from '../providers/swapTokenService';
import { BigNumber } from 'bignumber.js';

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
  elizaLogger.log('executeAutoTokenSwapTask', id);

  if (task.expireAt && new Date(task.expireAt).getTime() <= Date.now()) {
    elizaLogger.info(`Task has expired ${id}`);
    await runtime.databaseAdapter.removeMemory(id, 'AUTO_TOKEN_SWAP_TASK');
  }

  if (task.startAt && new Date(task.startAt).getTime() > Date.now()) {
    elizaLogger.info(`Task is not ready to start yet ${id}`);
    return;
  }

  if (
    task.priceTarget &&
    task.priceCondition &&
    task.priceCondition !== 'null' &&
    task.priceTarget !== 'null'
  ) {
    const tokenCA =
      task.tokenTarget ||
      (task.priceCondition === 'below'
        ? task.outputTokenCA
        : task.inputTokenCA);

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
  elizaLogger.log(
    `AUTO_TASK started successfully, ${id}, task: ${JSON.stringify(task)}`,
  );

  await runtime.databaseAdapter.removeMemory(id, AutoSwapTaskTable);
  const { keypair } = await getWalletKey(runtime, true);
  const txId = await executeSwapTokenTx(
    runtime,
    keypair,
    task.inputTokenCA,
    task.outputTokenCA,
    Number(task.inputTokenAmount),
  );
  elizaLogger.info(`AUTO_TASK Finished successfully ${id}, txId: ${txId}`);
}

export const autoTask: Action = {
  functionCallSpec: {
    name: 'AUTO_TASK',
    strict: true,
    additionalProperties: false,
    description:
      "Automatically executes a token swap when a specified condition is met, such as a price trigger or time delay. This function should only be used if the user specifies a condition like 'when price is above/below X', 'at X price', or 'after Y minutes'. If the user simply says 'sell token', this is NOT an auto task. When the user specifies 'buy <token> at certain condition', the default input token is SOL. When the user specifies 'sell <token> at certain condition', the default output token is SOL.",
    parameters: {
      type: 'object',
      properties: {
        inputTokenSymbol: {
          type: ['string', 'null'],
          description:
            'Symbol of the token to sell. If omitted in a buy order, SOL will be used by default. Either inputTokenSymbol or inputTokenCA must be provided.',
        },
        inputTokenCA: {
          type: ['string', 'null'],
          description:
            'Contract address of the token to sell. Either inputTokenSymbol or inputTokenCA must be provided.',
        },
        outputTokenSymbol: {
          type: ['string', 'null'],
          description:
            'Symbol of the token to buy. Either outputTokenSymbol or outputTokenCA must be provided.',
        },
        outputTokenCA: {
          type: ['string', 'null'],
          description:
            'Contract address of the token to buy. If omitted in a sell order, SOL will be used by default. Either outputTokenSymbol or outputTokenCA must be provided.',
        },
        inputTokenAmount: {
          type: ['number', 'null'],
          description:
            'Exact amount of inputToken to swap. Either inputTokenAmount or inputTokenPercentage must be provided.',
        },
        inputTokenPercentage: {
          type: ['number', 'null'],
          description:
            'Percentage of inputToken balance to swap. convert 100% to 1 Either inputTokenAmount or inputTokenPercentage must be provided. When extracting percentages, convert values like "50%" into decimal form (e.g., 0.5 instead of 50).',
        },
        priceCondition: {
          type: ['string', 'null'],
          description:
            "Defines whether the swap should be triggered when the target token's price is 'above' or 'below' the specified priceTarget.",
        },
        priceTarget: {
          type: ['number', 'null'],
          description: 'Price target for the swap',
        },
        tokenTarget: {
          type: ['string', 'null'],
          description:
            'Token symbol or contract address used for price trigger evaluation',
        },
        delay: {
          type: ['string', 'null'],
          description:
            'Time Delay for the swap, e.g., "after 5 minutes" or "below 0.00169", Either delay or priceTarget must be provided.',
        },
      },
      required: [
        'inputTokenSymbol',
        'outputTokenSymbol',
        'inputTokenCA',
        'outputTokenCA',
        'inputTokenAmount',
        'inputTokenPercentage',
        'priceCondition',
        'priceTarget',
        'delay',
      ],
    },
  },
  name: 'AUTO_TASK',
  similes: [
    'AUTO_BUY_TOKEN_TASK',
    'AUTO_SELL_TOKEN_TASK',
    'AUTO_SWAP_TOKEN_TASK',
  ],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
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
    callback?.(NotAgentAdminResponse);
    return null;
  }

  // generate formatted response from chat
  let swapReq = convertNullStrings(state.actionParameters) as AutoSwapTask;
  swapReq.inputTokenPercentage = Number(swapReq.inputTokenPercentage);
  swapReq.inputTokenAmount = Number(swapReq.inputTokenAmount);

  elizaLogger.log(`Response:`, swapReq);

  if (swapReq.inputTokenSymbol?.toUpperCase() === 'SOL') {
    swapReq.inputTokenCA = getRuntimeKey(runtime, 'SOL_ADDRESS');
  }
  if (swapReq.outputTokenSymbol?.toUpperCase() === 'SOL') {
    swapReq.outputTokenCA = getRuntimeKey(runtime, 'SOL_ADDRESS');
  }
  swapReq.inputTokenCA = validateAndAssignCA(
    swapReq.inputTokenSymbol,
    swapReq.inputTokenCA,
  );
  swapReq.outputTokenCA = validateAndAssignCA(
    swapReq.outputTokenSymbol,
    swapReq.outputTokenCA,
  );

  if (!swapReq.inputTokenCA) {
    swapReq.inputTokenCA = await getTokenCABySymbol(
      runtime,
      swapReq.inputTokenSymbol,
    );
    if (!swapReq.inputTokenCA) {
      const responseMsg = {
        text: 'Please provide a valid inputToken CA you want to sell',
      };
      callback?.(responseMsg);
      return null;
    }
  }

  if (!swapReq.outputTokenCA) {
    swapReq.outputTokenCA = await getTokenCABySymbol(
      runtime,
      swapReq.outputTokenSymbol,
    );
    if (!swapReq.outputTokenCA) {
      const responseMsg = {
        text: 'Please provide a valid outputToken CA you want to buy',
      };
      callback?.(responseMsg);
      return null;
    }
  }

  const client = await getSolanaClient(runtime);

  if (
    Number.isFinite(swapReq.outputTokenAmount) &&
    swapReq.outputTokenAmount != 0
  ) {
    callback?.({
      text: `Specify the buy amount of a token is not supported now, ${swapReq.outputTokenAmount} will be ignored.`,
    });
  }

  if (
    Number.isFinite(swapReq.inputTokenPercentage) &&
    swapReq.inputTokenPercentage != 0
  ) {
    const balance = await client.getUIBalance(swapReq.inputTokenCA);
    swapReq.inputTokenAmount = balance * swapReq.inputTokenPercentage;
  }

  if (
    !Number.isFinite(swapReq.inputTokenAmount) ||
    swapReq.inputTokenAmount <= 0
  ) {
    const responseMsg = {
      text: `Please provide a valid ${swapReq.inputTokenSymbol} input amount to perform the swap`,
      action: 'AUTO_TASK',
    };
    callback?.(responseMsg);
    return null;
  }

  const balance = await client.getUIBalance(swapReq.inputTokenCA);
  if (!balance) {
    const responseMsg = {
      text: 'Your input balance is 0.',
    };
    callback?.(responseMsg);
  }

  if (balance < swapReq.inputTokenAmount) {
    const responseMsg = {
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${balance} available.`,
    };
    callback?.(responseMsg);
    return null;
  }

  const WSOL_AMOUNT = await client.getUIBalance(NATIVE_MINT.toBase58());
  const GAS_BANANCE = 0.001; // require 0.001 SOL for gas fee

  if (swapReq.inputTokenCA !== NATIVE_MINT.toBase58()) {
    // buy with token
    const balance = await client.getUIBalance(NATIVE_MINT.toBase58());
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

  swapReq.expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
    swapReq.inputTokenPercentage = (swapReq.inputTokenAmount/balance);
    const swapInfo = formatTaskInfo(swapReq);
    const responseMsg = {
      text: `${swapInfo}`,
      action: 'AUTO_TASK',
    };
    callback?.(responseMsg);
    return null;
  }

  if (!isValidSPLTokenAddress(swapReq.tokenTarget)) {
    swapReq.tokenTarget =
      swapReq.tokenTarget === swapReq.inputTokenSymbol
        ? swapReq.inputTokenCA
        : swapReq.outputTokenCA;
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
  const decimals = await new SolanaClient(rpcUrl, keypair.publicKey).getMintDecimals(inputTokenCA);
  const {slippage, priorityFee, tip, mode } = await getTradeSettings(runtime.agentId);
  const txid = await await new SwapTokenService().swapToken(
    {
      connection,
      userWalletAddress: keypair.publicKey.toBase58(),
      inputTokenCA,
      outputTokenCA,
      amount: BigNumber(amount).multipliedBy(new BigNumber(10).pow(decimals)).integerValue(),
      keyPair :keypair,
      slippage,
      priorityFee,
      tip: tip * LAMPORTS_PER_SOL,
      mode,
    });
  return txid;
}

function formatTaskInfo({
  inputTokenAmount,
  inputTokenCA,
  inputTokenPercentage,
  inputTokenSymbol,
  outputTokenSymbol,
  outputTokenCA,
  priceCondition,
  priceTarget,
  tokenTarget,
  startAt,
  expireAt,
}: AutoSwapTask): string {

  const displayedInputSymbol = trimTokenSymbol(`$${inputTokenSymbol || inputTokenCA}`);
  const displayedOutputSymbol = trimTokenSymbol(`$${outputTokenSymbol || outputTokenCA}`);
  const displayedTokenTarget =
    tokenTarget === inputTokenCA ? displayedInputSymbol :
      tokenTarget === outputTokenCA ? displayedOutputSymbol :
        trimTokenSymbol(`$${tokenTarget}`);

  const swapType = inputTokenCA === NATIVE_MINT.toBase58() ? 'buy' : 'sell';
  const tokenInfo = swapType === 'sell' ? `${displayedInputSymbol} (${inputTokenCA})` : `${displayedOutputSymbol} (${outputTokenCA})`;

  const amountInfo =
    swapType === 'sell'
      ? `${inputTokenAmount}(${(inputTokenPercentage * 100)?.toFixed(1)}%)`
      : `${inputTokenAmount} ${displayedInputSymbol}`;
  const trigger = priceCondition
    ? `${displayedTokenTarget} price ${priceCondition} $${priceTarget}`
    : `At ${startAt.toUTCString()}`;
  let taskInfo =
    'Please confirm the info below. If any adjustments are needed, let me know the updated details.\n';
  taskInfo += '————\n';
  taskInfo += `⬇️ Type: Limit ${swapType} order\n`;
  taskInfo += `🪙 Token: ${tokenInfo}\n`;
  taskInfo += `💰 ${swapType} Amount: ${amountInfo}\n`;
  taskInfo += `⚡️ Trigger: ${trigger}\n`;
  taskInfo += `⏰ Expire time: ${expireAt ? expireAt.toUTCString().replace('GMT', 'UTC') : 'Never'}\n`;
  taskInfo += `————\n`;
  taskInfo += `You can cancel your scheduled tasks on the [Tasks] subpage.\nReply 'ok' or 'yes' to confirm.`;
  return taskInfo;
}
