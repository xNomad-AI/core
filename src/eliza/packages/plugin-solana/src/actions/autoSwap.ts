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
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import {
  convertNullStrings,
  md5sum,
} from '../providers/swapUtils.js';
import {
  validateAndAssignCA,
  getTokenCABySymbol,
  isValidSPLTokenAddress,
  trimTokenSymbol,
} from '../providers/tokenUtils.js';
import {
  getSolanaClient,
} from '../providers/solanaClient.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { userConfirmTemplate } from '../providers/type.js';

export const LimitOrderTable = 'limitOrders';
export interface LimitOrderTask {
  id: string;
  chain: string;
  agentId: string;
  inputTokenSymbol: string | null;
  outputTokenSymbol: string | null;
  inputTokenCA: string | null;
  outputTokenCA: string | null;
  targetTokenCA: string | null;
  inputTokenAmount: number | string | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: number | string | null;
  delay: string | null;
  startAt: Date | null;
  expireAt: Date;
  priceCondition: 'below' | 'above' | null;
  targetPrice: number | null;
  targetToken: string | null;
  pendingConfirmation: boolean | null;
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
            "Defines whether the swap should be triggered when the target token's price is 'above' or 'below' the specified targetPrice.",
        },
        targetPrice: {
          type: ['number', 'null'],
          description: 'Price target for the swap',
        },
        targetToken: {
          type: ['string', 'null'],
          description:
            'Token symbol used for price trigger evaluation',
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
  formatParameters: async (runtime: IAgentRuntime, parameters: any, callback?: HandlerCallback) => {
    elizaLogger.log('parameters (formatParameters): ', parameters);
    const formattedParameters = parameters as LimitOrderTask;
    if (formattedParameters.inputTokenSymbol?.toUpperCase() === 'SOL') {
      formattedParameters.inputTokenCA = NATIVE_MINT.toBase58();
    }
    if (formattedParameters.outputTokenSymbol?.toUpperCase() === 'SOL') {
      formattedParameters.outputTokenCA = NATIVE_MINT.toBase58();
    }
    formattedParameters.inputTokenCA = validateAndAssignCA(
      formattedParameters.inputTokenSymbol,
      formattedParameters.inputTokenCA,
    );
    formattedParameters.outputTokenCA = validateAndAssignCA(
      formattedParameters.outputTokenSymbol,
      formattedParameters.outputTokenCA,
    );

    formattedParameters.inputTokenCA = formattedParameters.inputTokenCA ||
      formattedParameters.inputTokenSymbol? await getTokenCABySymbol(
      runtime,
      formattedParameters.inputTokenSymbol,
    ) : null;
    formattedParameters.outputTokenCA = formattedParameters.outputTokenCA ||
      formattedParameters.outputTokenSymbol? await getTokenCABySymbol(
      runtime,
      formattedParameters.outputTokenSymbol,
    ) : null;
    formattedParameters.targetTokenCA =
    (formattedParameters.targetToken === NATIVE_MINT.toBase58() ? NATIVE_MINT.toBase58() : null) ||
    formattedParameters.targetTokenCA ||
    (formattedParameters.targetToken === formattedParameters.inputTokenSymbol ? formattedParameters.inputTokenCA : null) ||
    (formattedParameters.targetToken === formattedParameters.outputTokenSymbol ? formattedParameters.outputTokenCA : null) ||
    formattedParameters.targetToken ? await getTokenCABySymbol(runtime, formattedParameters.targetToken) : null;

    if (!formattedParameters.inputTokenCA || !isValidSPLTokenAddress(formattedParameters.inputTokenCA)) {
      callback?.({
        text: 'Please provide a valid inputToken CA you want to sell',
      });
      return {status: 'incomplete info', parameters: parameters};
    }

    if (!formattedParameters.outputTokenCA || !isValidSPLTokenAddress(formattedParameters.outputTokenCA)) {
      callback?.({
        text: 'Please provide a valid outputToken CA you want to buy',
      });
      return {status: 'incomplete info', parameters: parameters};
    }

    if (!formattedParameters.targetTokenCA || !isValidSPLTokenAddress(formattedParameters.targetTokenCA)) {
      callback?.({
        text: `Please specify which token's price you want to monitor: ${formattedParameters.inputTokenCA} or ${formattedParameters.outputTokenCA}?`,
      });
      return {status: 'incomplete info', parameters: parameters};
    }

    if (
      Number.isFinite(formattedParameters.outputTokenAmount) &&
      formattedParameters.outputTokenAmount != 0
    ) {
      callback?.({
        text: `Specify the buy amount of a token is not supported now, ${formattedParameters.outputTokenAmount} will be ignored.`,
      });
      return {status: 'incomplete info', parameters: parameters};
    }

    if (!formattedParameters.targetPrice && !formattedParameters.delay) {
      callback?.({
        text: "If you'd like to create an autotask, please specify the target price for the swap or provide a time delay, such as 'after 5 minutes' or 'below 0.00169' ",
      });
      return {status: 'incomplete info', parameters: parameters};
    }
    
    const client = await getSolanaClient(runtime);

    if (
      Number.isFinite(formattedParameters.inputTokenPercentage) &&
      formattedParameters.inputTokenPercentage != 0
    ) {
      const balance = await client.getUIBalance(formattedParameters.inputTokenCA);
      formattedParameters.inputTokenAmount = balance * formattedParameters.inputTokenPercentage;
    }

    
    return {status: 'success', parameters: formattedParameters};
  },
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
    if (!status || status != 'success') {
      return status || 'failed';
    }
    try {
      task.id = stringToUuid(new Date().toISOString());
      task.chain = 'solana';
      task.agentId = runtime.agentId;
      await runtime.databaseAdapter.insert(
        LimitOrderTable,
        task,
      );
      elizaLogger.info(`AUTO_Task Created, ${JSON.stringify(task)}`);
      const responseMsg = {
        text: `AutoTask Created Successfully`,
      };
      callback?.(responseMsg);
      return 'success';
    } catch (error) {
      elizaLogger.error(`Error during autotask create:, ${error}`);
      const responseMsg = {
        text: `Emm... something went wrong, please try again later`,
      };
      callback?.(responseMsg);
      return 'failed';
    }
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
  task?: LimitOrderTask;
}> {
  // check if the swap request is from agent owner or public chat
  const isAdmin = await isAgentAdmin(runtime, message);
  if (!isAdmin) {
    callback?.(NotAgentAdminResponse);
    return {status: 'rejected'};
  }
  const swapReq = state.actionParameters as LimitOrderTask;
  elizaLogger.info(`swapReq: ${JSON.stringify(swapReq)}`);
  
  const client = await getSolanaClient(runtime);
  const balance = await client.getUIBalance(swapReq.inputTokenCA);
  if (!balance) {
    callback?.({
      text: 'Your input balance is 0.',
    });
    return {status: 'failed'};
  }

  if (balance < Number(swapReq.inputTokenAmount)) {
    callback?.({
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${balance} available.`,
    });
    return {status: 'failed'};
  }

  const WSOL_AMOUNT = await client.getUIBalance(NATIVE_MINT.toBase58());
  const GAS_BALANCE = 0.001; // require 0.001 SOL for gas fee

  if (swapReq.inputTokenCA !== NATIVE_MINT.toBase58()) {
    // buy with token
    const balance = await client.getUIBalance(NATIVE_MINT.toBase58());
    if (balance < GAS_BALANCE) {
      elizaLogger.error('Insufficient balance for swap gas fee');
      callback?.({
        text:
          `Insufficient balance for swap gas fee, required: ${GAS_BALANCE} SOL but only have: ` +
          balance,
      });
      return {status: 'failed'};
    }
  } else if (WSOL_AMOUNT - Number(swapReq.inputTokenAmount) < GAS_BALANCE) {
    // buy with SOL
    const requiredAmount = GAS_BALANCE + Number(swapReq.inputTokenAmount);
    elizaLogger.error('Insufficient balance for swap gas fee');
    callback?.({
      text:
        `Insufficient balance for swap gas fee, required: ${requiredAmount} SOL but only have: ` +
        WSOL_AMOUNT,
    });
    return {status: 'failed'};
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

  if (swapReq.pendingConfirmation === true) {
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
        action: 'AUTO_TASK',
      });
      return {status: 'cancelled'};
    } else if (confirmResponse.userAcked == 'confirmed') {
      return {status: 'success', task: swapReq};
    } else if (confirmResponse.userAcked == "pending") {
      callback?.({
        text: "I repeatedly asked you to confirm the task although you have already confirmed it. It was my mistake. Please try again.",
        action: "AUTO_TASK"
      });
      return { status: "pending" };
    } else {
      callback?.({
        text: "I failed to recognize your confirmation. Please try again.",
        action: "AUTO_TASK"
      });
      return { status: "failed" };
    }
  } else {
    swapReq.inputTokenPercentage = Number(swapReq.inputTokenAmount)/balance;
    const swapInfo = formatTaskInfo(swapReq);
    callback?.({
      text: `${swapInfo}`,
      result: 'Pending user confirmation',
      action: 'AUTO_TASK',
    });
    return {status: 'pending'};
  }
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
}: LimitOrderTask): string {

  const displayedInputSymbol = trimTokenSymbol(`$${inputTokenSymbol || inputTokenCA}`);
  const displayedOutputSymbol = trimTokenSymbol(`$${outputTokenSymbol || outputTokenCA}`);
  const displayedtargetToken = trimTokenSymbol(`$${targetToken} (${targetTokenCA})`);

  const swapType = inputTokenCA === NATIVE_MINT.toBase58() ? 'buy' : 'sell';
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
