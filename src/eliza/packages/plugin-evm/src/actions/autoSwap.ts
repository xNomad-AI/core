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
import { BigNumber } from 'bignumber.js';
export const LimitOrderTable = 'limitOrders';
export interface LimitOrder {
  id: string;
  chain: string;
  agentId: string;
  inputTokenSymbol: string | null;
  outputTokenSymbol: string | null;
  inputTokenCA: string | null;
  outputTokenCA: string | null;
  inputTokenAmount: string | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: string | null;
  startAt: Date | null;
  expireAt: Date | null;
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
          type: ['string', 'null'],
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
            'Token symbol or CA used for price trigger evaluation',
        },
        expireAt: {
          type: ['string', 'number', 'null'],
          description:
          'Expire time for the limit order, default is null. If user says a delay like "after 5 days" or "expire in 10 minutes", return the number duration in seconds',
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
        'targetToken',
        'expireAt',
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

    // try to get targetTokenCA from swapReq.targetTokenCA, swapReq.inputTokenCA, swapReq.outputTokenCA, or getTokenCABySymbol
  swapReq.targetTokenCA = 
    (client.isNativeToken(swapReq.targetToken) ? nativeTokenAddress : null) ||
    swapReq.targetTokenCA ||
    (swapReq.targetToken === swapReq.inputTokenSymbol ? swapReq.inputTokenCA : null) ||
    (swapReq.targetToken === swapReq.outputTokenSymbol ? swapReq.outputTokenCA : null) ||
    await getTokenCABySymbol(runtime, chain, swapReq.targetToken);

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
    swapReq.outputTokenAmount &&
    +swapReq.outputTokenAmount > 0
  ) {
    callback?.({
      text: `Specify the buy amount of a token is not supported now, ${swapReq.outputTokenAmount} will be ignored.`,
    });
    return {status: 'pending'};
  }

  swapReq.startAt = new Date();
  if (!isNaN(Number(swapReq.expireAt))) {
    swapReq.expireAt = new Date(swapReq.startAt.getTime() + Number(swapReq.expireAt) * 1000);
  } else if (swapReq.expireAt) {
    swapReq.expireAt = new Date(swapReq.expireAt);
  } else {
    swapReq.expireAt = null;
  }

  const uiBalance = await client.getTokenUIBalance(swapReq.inputTokenCA, address);

  if (
    !swapReq.inputTokenAmount &&
    swapReq.inputTokenPercentage &&
    +swapReq.inputTokenPercentage > 0
  ) {
    swapReq.inputTokenAmount = BigNumber(uiBalance).multipliedBy(swapReq.inputTokenPercentage).toString();
  }

  if (!swapReq.inputTokenAmount || +swapReq.inputTokenAmount <= 0) {
    callback?.({
      text: `Please provide a valid ${swapReq.inputTokenSymbol} input amount to perform the swap`,
      action: 'AUTO_TASK',
    });
    return {status: 'pending'};
  }

  if (!uiBalance) {
    callback?.({
      text: 'Your input balance is 0.',
    });
    return {status: 'failed'};
  }

  if (BigNumber(uiBalance).lt(swapReq.inputTokenAmount)) {
    callback?.({
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${uiBalance} available.`,
    });
    return {status: 'failed'};
  }

  if (!swapReq.targetPrice) {
    callback?.({
      text: "If you'd like to create an autotask, please specify the target price for the swap, e.g., 'below 0.00169' ",
    });
    return {status: 'pending'};
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
    swapReq.inputTokenPercentage = BigNumber(swapReq.inputTokenAmount).div(uiBalance).toNumber();
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
  const displayedtargetToken =  trimTokenSymbol(`$${targetToken} (${targetTokenCA})`);

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
