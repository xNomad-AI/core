import {
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action,
  elizaLogger,
  composeContext,
  generateObjectDeprecated,
  ModelClass, ActionStatus,
} from '@elizaos/core';
import { convertNullStrings } from '../providers/environment.js';
import { isValidAddress } from '../providers/tokenUtils.js';
import { getWalletKey } from '../providers/keypairUtils.js';
import { isAgentAdmin, NotAgentAdminResponse } from '../providers/walletUtils.js';
import { SharedProvider } from '../index.js';
import { userConfirmTemplate } from '../providers/type.js';

type CopyTradeParameters = {
  name: string;
  targetAddress: string;
  mode: 'fixedAmount' | 'percentage';
  fixedAmount: number | undefined;
  percentage: number | undefined;
  copySell: boolean;
  walletAddress: string;
  expiredAt: number | undefined;
  agentId: string;
};


export const copyTrade: Action = {
  functionCallSpec: {
    name: 'COPY_TRADE',
    strict: true,
    additionalProperties: false,
    description: 'Copy the trade of a given account',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: ['string', 'null'],
          description: 'The name user set to this copy trade',
        },
        targetAddress: {
          type: 'string',
          description: 'The address of the account to copy trade from',
        },
        mode: {
          type: ['string'],
          description:
            'The mode of copying trade, enum can be "fixed" or "percentage"',
        },
        copySell: {
          type: 'boolean',
          description: 'Whether to copy sell trade, default value: true',
        },
        fixedAmount: {
          type: ['number', 'null'],
          description:
            'The fixed input native token amount to copy trade, Either this or "percentage" must be provided ',
        },
        percentage: {
          type: ['number', 'null'],
          description:
            'The percentage of the trade to copy, expressed as a decimal. for example, 1 = 100%, 0.5 = 50%. Either this or "fixedAmount" must be provided',
        },
      },
      required: ['targetAddress', 'fixedAmount', 'percentage'],
    },
  },
  name: 'COPY_TRADE',
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  similes: [],
  description: 'Copy the trade of a given account',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionStatus> => {
    // check if the swap request is from agent owner or public chat
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      callback?.(NotAgentAdminResponse);
      return 'rejected';
    }

    let response = convertNullStrings(
      state.actionParameters,
    ) as CopyTradeParameters;

    if (!response.name) {
      response.name = `COPY_TRADE-${response.walletAddress}`;
    }
    if (!isValidAddress(response.targetAddress)) {
      callback?.({
        text: `Please provide a valid wallet address to copy trade.`,
        action: 'COPY_TRADE',
      });
      return 'pending';
    }

    if (Number.isFinite(response.fixedAmount) && response.fixedAmount > 0) {
      response.mode = 'fixedAmount';
    } else if (
      Number.isFinite(response.percentage) &&
      response.percentage > 0 &&
      response.percentage <= 1
    ) {
      response.mode = 'percentage';
    } else {
      callback?.({
        text: `Please provide a valid input amount or percentage to copy trade.`,
        action: 'COPY_TRADE',
      });
      return 'pending';
    }

    const {address, privateKey} = await getWalletKey(runtime, true);
    response.walletAddress = address;
    response.agentId = runtime.agentId;
    const records = await runtime.databaseAdapter.find?.('copyTrades', {
      agentId: response.agentId,
      targetAddress: response.targetAddress,
      walletAddress: response.walletAddress,
    });
    if (records?.length > 0){
      callback({
        text: 'You have already set copy trade of this address. You can edit the copy trade on the [Tasks] subpage.'
      });
      return 'failed';
    }
    elizaLogger.log('COPY_TRADE:', response);

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
        text: 'ok. I will not set this.',
      };
      callback?.(responseMsg);
      return 'cancelled';
    }

    if (confirmResponse.userAcked == 'pending') {
      const responseMsg = {
        text: `${formatConfirmMessage(response)}`,
      };
      callback?.(responseMsg);
      return 'pending';
    }

    const { id } = await SharedProvider.get<any>(
      'tradeMonitorService',
    ).createCopyTrade({
      targetAddress: response.targetAddress,
      walletAddress: response.walletAddress,
      expiredAt: response.expiredAt || 0,
    });
    await runtime.databaseAdapter.insert?.('copyTrades', {
      ...response,
      id,
      status: 'running',
      createdAt: new Date(),
    });

    callback?.({
      text: `Copy trade created successfully.`,
      action: `COPY_TRADE`,
    });
    return 'success';
  },

  examples: [] as ActionExample[][],
} as Action;

function formatConfirmMessage(response: CopyTradeParameters): string {
  const buyInfo = Number.isFinite(response.fixedAmount)
    ? `Buy amount: ${response.fixedAmount}`
    : `Buy percentage: ${response.percentage * 100}% of target order`;
  return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
👀 Type: copy trade
💼 Target wallet address: ${response.targetAddress}
🏷️ Name: ${response.name}
🔆 Copy mode: ${response.mode}
💰 ${buyInfo}
⬆️ Copy sell: ${response.copySell ? 'yes' : 'no'}
————
You can stop the copy trade on the [Tasks] subpage. 
Reply 'ok' or 'yes' to confirm.`;
}
