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
  stringToUuid, ActionStatus,
} from '@elizaos/core';

import { getWalletKey } from '../providers/keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';

import {
  getSwapTokenPrice,
  validateAndAssignCA,
  getTokenCABySymbol,
  trimTokenSymbol,
} from '../providers/tokenUtils.js';
import { convertNullStrings, getChainRPC, getEvmClient, getRuntimeDefaultChain, md5sum } from '../providers/environment.js';
import { getTradeSettings, SwapTokenService } from '../providers/swapTokenService.js';
import { BigNumber } from 'bignumber.js';
import { userConfirmTemplate } from '../providers/type.js';
import { EVMClient, nativeTokenAddress } from '../providers/evmClient.js';

export const AutoSwapTaskTable = 'AUTO_TOKEN_SWAP_TASK';
export interface AutoSwapTask {
  chain: string;
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

    const chain = getRuntimeDefaultChain(runtime);
    const tokenPrice = await getSwapTokenPrice(runtime, chain, tokenCA);
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
  const { address, privateKey } = await getWalletKey(runtime, true);
  const chain = getRuntimeDefaultChain(runtime);
  const txId = await executeSwapTokenTx(
    runtime,
    chain,
    address,
    privateKey,
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
    if (!status || status != 'success') {
      return status || 'failed';
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
  task?: AutoSwapTask;
}> {
  // check if the swap request is from agent owner or public chat
  const isAdmin = await isAgentAdmin(runtime, message);
  if (!isAdmin) {
    callback?.(NotAgentAdminResponse);
    return {status: 'rejected'};
  }

  // generate formatted response from chat
  let swapReq = convertNullStrings(state.actionParameters) as AutoSwapTask;
  const chain = getRuntimeDefaultChain(runtime);
  const client = getEvmClient(runtime, chain);
  const { address } = await getWalletKey(runtime, true);
  swapReq.inputTokenPercentage = Number(swapReq.inputTokenPercentage);
  swapReq.inputTokenAmount = Number(swapReq.inputTokenAmount);
  swapReq.chain = chain;
  elizaLogger.log(`Response:`, swapReq);

  swapReq.inputTokenCA = validateAndAssignCA(
    swapReq.inputTokenSymbol,
    swapReq.inputTokenCA,
  );
  swapReq.outputTokenCA = validateAndAssignCA(
    swapReq.outputTokenSymbol,
    swapReq.outputTokenCA,
  );

  if (client.isNativeToken(swapReq.inputTokenSymbol)) {
    swapReq.inputTokenCA = nativeTokenAddress;
  }
  if (client.isNativeToken(swapReq.outputTokenSymbol)) {
    swapReq.outputTokenCA = nativeTokenAddress;
  }

  if (!swapReq.inputTokenCA) {
    swapReq.inputTokenCA = await getTokenCABySymbol(
      runtime,
      chain,
      swapReq.inputTokenSymbol,
    );
    if (!swapReq.inputTokenCA) {
      const responseMsg = {
        text: 'Please provide a valid inputToken CA you want to sell',
      };
      callback?.(responseMsg);
      return {status: 'pending'};
    }
  }

  if (!swapReq.outputTokenCA) {
    swapReq.outputTokenCA = await getTokenCABySymbol(
      runtime,
      chain,
      swapReq.outputTokenSymbol,
    );
    if (!swapReq.outputTokenCA) {
      const responseMsg = {
        text: 'Please provide a valid outputToken CA you want to buy',
      };
      callback?.(responseMsg);
      return {status: 'pending'};
    }
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
    const responseMsg = {
      text: `Please provide a valid ${swapReq.inputTokenSymbol} input amount to perform the swap`,
      action: 'AUTO_TASK',
    };
    callback?.(responseMsg);
    return {status: 'pending'};
  }

  const balance = await client.getTokenUIBalance(swapReq.inputTokenCA, address);
  if (!balance) {
    const responseMsg = {
      text: 'Your input balance is 0.',
    };
    callback?.(responseMsg);
    return {status: 'failed'};
  }

  if (Number(balance) < swapReq.inputTokenAmount) {
    const responseMsg = {
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${balance} available.`,
    };
    callback?.(responseMsg);
    return {status: 'failed'};
  }

  if (!swapReq.priceTarget && !swapReq.delay) {
    const responseMsg = {
      text: "If you'd like to create an autotask, please specify the target price for the swap or provide a time delay, such as 'after 5 minutes' or 'below 0.00169' ",
    };
    callback?.(responseMsg);
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

  swapReq.expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  elizaLogger.info(`checking if user confirm to create task`);

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
      text: 'ok. I will not set the autotask.',
    };
    callback?.(responseMsg);
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

async function executeSwapTokenTx(
  runtime: IAgentRuntime,
  chain: string,
  address: string,
  privateKey: string,
  inputTokenCA: string,
  outputTokenCA: string,
  amount: number,
) {
  elizaLogger.info(
    `swapToken ${address} : ${inputTokenCA} for ${outputTokenCA} amount: ${amount}`,
  );
  const rpcUrl = getChainRPC(runtime, chain);
  const evmClient = getEvmClient(runtime, chain);
  const decimals = await evmClient.getTokenDecimals(inputTokenCA);
  const {slippage, mode } = await getTradeSettings(runtime.agentId);
  const txid = await new SwapTokenService().swapToken(
    {
      rpcUrl,
      chainName: chain,
      userWalletAddress: address,
      privateKey,
      inputTokenCA,
      outputTokenCA,
      amount: BigNumber(amount).multipliedBy(new BigNumber(10).pow(decimals)).integerValue(),
      slippage,
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

  const swapType = inputTokenCA === nativeTokenAddress ? 'buy' : 'sell';
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
