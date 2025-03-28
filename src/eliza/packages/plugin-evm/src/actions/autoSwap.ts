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
  ActionStatus,
  stringToUuid,
} from '@elizaos/core';
import { getWalletKey } from '../providers/keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import {
  getTokenCABySymbol,
  trimTokenSymbol,
  isValidAddress,
} from '../providers/tokenUtils.js';
import { convertNullStrings, getEvmClient, getRuntimeDefaultChain } from '../providers/environment.js';
import { userConfirmTemplate } from '../providers/type.js';
import { nativeTokenAddress } from '../providers/evmClient.js';
export const LimitOrderTable = 'limitOrders';
export interface LimitOrder {
  id: string;
  chain: string;
  agentId: string;
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
  targetPrice: number | null;
  targetToken: string | null;
  targetTokenCA: string;
}



export const autoTask: Action = {
  functionCallSpec: {
    name: 'AUTO_TASK',
    strict: true,
    additionalProperties: false,
    description:
      "Automatically executes a token swap when a specified condition is met, such as a price trigger or time delay. This function should only be used if the user specifies a condition like 'when price is above/below X', 'at X price', or 'after Y minutes'. If the user simply says 'sell token', this is NOT an auto task. When the user specifies 'buy <token> at certain condition', the default input token is native token of the chain. When the user specifies 'sell <token> at certain condition', the default output token is native token of the chain.",
    parameters: {
      type: 'object',
      properties: {
        inputTokenSymbol: {
          type: ['string', 'null'],
          description:
            'Symbol of the token to sell. If omitted in a buy order, native token of the chain will be used by default. Either inputTokenSymbol or inputTokenCA must be provided.',
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
            'Contract address of the token to buy. If omitted in a sell order, native token of the chain will be used by default. Either outputTokenSymbol or outputTokenCA must be provided.',
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
            "Defines whether the swap should be triggered when the target token's price is 'above' or 'below' the specified targetPrice.",
        },
        targetPrice: {
          type: ['number', 'null'],
          description: 'Price target for the swap',
        },
        targetToken: {
          type: ['string', 'null'],
          description:
            'Token symbol or contract address used for price trigger evaluation',
        },
        delay: {
          type: ['string', 'null'],
          description:
            'Time Delay for the swap, e.g., "after 5 minutes" or "below 0.00169", Either delay or targetPrice must be provided.',
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
        'targetPrice',
        'delay',
      ],
    },
  },
  name: 'AUTO_TASK',
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
  ): Promise<ActionStatus> => {
    const {task, status} = await checkResponse(
      runtime,
      message,
      state,
      _options,
      callback,
    );
    if (status != 'success') {
      return status;
    }
    task.id = stringToUuid(new Date().toISOString());
    await runtime.databaseAdapter.insert(
      LimitOrderTable,
      task,
    );
    elizaLogger.info(`AUTO_Task Created, ${JSON.stringify(task)}`);
    callback?.({
      text: `AutoTask Created Successfully`,
    });
    return 'success';
  },
  examples: [] as ActionExample[][],
} as Action;

async function checkResponse(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback,
): Promise<{
  status: ActionStatus;
  task?: LimitOrder;
}> {
  // check if the swap request is from agent owner or public chat
  const isAdmin = await isAgentAdmin(runtime, message);
  if (!isAdmin) {
    callback?.(NotAgentAdminResponse);
    return {status: 'rejected'};
  }

  // generate formatted response from chat
  const swapReq = convertNullStrings(state.actionParameters) as LimitOrder;
  const chain = getRuntimeDefaultChain(runtime);
  const client = getEvmClient(runtime, chain);
  const { address } = await getWalletKey(runtime, true);
  swapReq.inputTokenPercentage = Number(swapReq.inputTokenPercentage);
  swapReq.inputTokenAmount = Number(swapReq.inputTokenAmount);
  swapReq.chain = chain;
  swapReq.agentId = runtime.agentId;

  if (client.isNativeToken(swapReq.inputTokenSymbol)) {
    swapReq.inputTokenCA = nativeTokenAddress;
  }
  if (client.isNativeToken(swapReq.outputTokenSymbol)) {
    swapReq.outputTokenCA = nativeTokenAddress;
  }
  if (client.isNativeToken(swapReq.targetToken)) {
    swapReq.targetTokenCA = nativeTokenAddress;
  }

  swapReq.inputTokenCA = swapReq.inputTokenCA || await getTokenCABySymbol(
    runtime,
    chain,
    swapReq.inputTokenSymbol,
  );

  swapReq.outputTokenCA = swapReq.outputTokenCA || await getTokenCABySymbol(
    runtime,
    chain,
    swapReq.outputTokenSymbol,
  );

  swapReq.targetTokenCA = swapReq.targetTokenCA || await getTokenCABySymbol(
    runtime,
    chain,
    swapReq.targetToken,
  ) || swapReq.targetToken === swapReq.inputTokenSymbol ? swapReq.inputTokenCA : swapReq.outputTokenCA;
  

  if (!swapReq.inputTokenCA) {
    callback?.({
      text: 'Please provide a valid inputToken CA you want to sell',
    });
    return {status: 'pending'};
  }

  if (!swapReq.outputTokenCA) {
    callback?.({
      text: 'Please provide a valid outputToken CA you want to buy',
    });
    return {status: 'pending'};
  }

  if (!swapReq.targetTokenCA) {
    callback?.({
      text: `Please specify which token's price you want to monitor: ${swapReq.inputTokenCA} or ${swapReq.outputTokenCA}?`,
    });
    return {status: 'pending'};
  }

  if (
    Number.isFinite(swapReq.outputTokenAmount) &&
    swapReq.outputTokenAmount != 0
  ) {
    callback?.({
      text: `Specify the buy amount of a token is not supported now, ${swapReq.outputTokenAmount} will be ignored.`,
    });
    return {status: 'pending'};
  }

  if (
    Number.isFinite(swapReq.inputTokenPercentage) &&
    swapReq.inputTokenPercentage != 0
  ) {
    const balance = await client.getTokenUIBalance(swapReq.inputTokenCA, address);
    swapReq.inputTokenAmount = Number(balance) * swapReq.inputTokenPercentage;
  }

  if (
    !Number.isFinite(swapReq.inputTokenAmount) ||
    swapReq.inputTokenAmount <= 0
  ) {
    callback?.({
      text: `Please provide a valid ${swapReq.inputTokenSymbol} input amount to perform the swap`,
      action: 'AUTO_TASK',
    });
    return {status: 'pending'};
  }

  const balance = await client.getTokenUIBalance(swapReq.inputTokenCA, address);
  if (!balance) {
    callback?.({
      text: 'Your input balance is 0.',
    });
    return {status: 'failed'};
  }

  if (Number(balance) < swapReq.inputTokenAmount) {
    callback?.({
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${balance} available.`,
    });
    return {status: 'failed'};
  }

  if (!swapReq.targetPrice && !swapReq.delay) {
    callback?.({
      text: "If you'd like to create an autotask, please specify the target price for the swap or provide a time delay, such as 'after 5 minutes' or 'below 0.00169' ",
    });
    return {status: 'pending'};
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

  if (!isValidAddress(swapReq.targetTokenCA)) {
    swapReq.targetTokenCA =
      swapReq.targetToken === swapReq.inputTokenSymbol
        ? swapReq.inputTokenCA
        : swapReq.outputTokenCA;
  }

  if (!isValidAddress(swapReq.targetTokenCA)) {
    callback({
      text: "Please provide a valid target token CA",
    });
    return {status: 'pending'};
  }

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
    callback?.({
      text: 'ok. I will not set the autotask.',
    });
    return {status: 'cancelled'};
  }

  if (confirmResponse.userAcked == 'pending') {
    swapReq.inputTokenPercentage = (swapReq.inputTokenAmount/Number(balance));
    const swapInfo = formatTaskInfo(swapReq);
    const responseMsg = {
      text: `${swapInfo}`,
      action: 'AUTO_TASK',
    };
    callback?.(responseMsg);
    return {status: 'pending'};
  }
  return {status: 'success', task: swapReq};
}

function formatTaskInfo({
  inputTokenAmount,
  inputTokenCA,
  inputTokenPercentage,
  inputTokenSymbol,
  outputTokenSymbol,
  outputTokenCA,
  priceCondition,
  targetPrice,
  targetToken,
  targetTokenCA,
  startAt,
  expireAt,
}: LimitOrder): string {
  const displayedInputSymbol = trimTokenSymbol(`$${inputTokenSymbol || inputTokenCA}`);
  const displayedOutputSymbol = trimTokenSymbol(`$${outputTokenSymbol || outputTokenCA}`);
  const displayedtargetToken =
    targetTokenCA === inputTokenCA ? displayedInputSymbol :
      targetTokenCA === outputTokenCA ? displayedOutputSymbol :
        trimTokenSymbol(`$${targetToken} (${targetTokenCA})`);

  const swapType = inputTokenCA === nativeTokenAddress ? 'buy' : 'sell';
  const tokenInfo = swapType === 'sell' ? `${displayedInputSymbol} (${inputTokenCA})` : `${displayedOutputSymbol} (${outputTokenCA})`;

  const amountInfo =
    swapType === 'sell'
      ? `${inputTokenAmount}(${(inputTokenPercentage * 100)?.toFixed(1)}%)`
      : `${inputTokenAmount} ${displayedInputSymbol}`;
  const trigger = priceCondition
    ? `${displayedtargetToken} price ${priceCondition} $${targetPrice}`
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
