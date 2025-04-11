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
import { convertNullStrings } from '../providers/swapUtils.js';
import { isValidAddress } from '../providers/tokenUtils.js';
import { getWalletKey } from '../keypairUtils';
import { SharedProvider } from '../index';
import { isAgentAdmin, NotAgentAdminResponse } from '../providers/walletUtils';

type CopyTradeParameters = {
  name: string;
  chain: string;
  targetAddress: string;
  mode: 'fixedAmount' | 'percentage';
  fixedAmount: number | undefined;
  percentage: number | undefined;
  copySell: boolean;
  walletAddress: string;
  expiredAt: number | undefined;
  agentId: string;
  pendingConfirmation: boolean | null;
};

const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user's response to the confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
Consider the latest messages from the conversation history above. Determine the user's response status regarding the confirmation.
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

Decision Criteria:
•"confirmed" → The user has explicitly confirmed the transfer using words like “yes”, “confirm”, “okay”, “sure”, etc.
•"rejected" → The user has responded with anything other than a confirmation.
•"pending" → The user has provided a complete transfer request, but User2 has not yet sent the confirmation prompt.

Additional Rules:
•If the user issues a new instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•Analyze the last five messages to understand the user's intent in context.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

❓ **Should return \`"pending"\`**  
- User1: "copy trade 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7"  

- User1: "chat"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;

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
            'The mode of copying trade, enum can be "fixedAmount" or "percentage"',
        },
        copySell: {
          type: 'boolean',
          description: 'Whether to copy sell trade, default value: true',
        },
        fixedAmount: {
          type: ['number', 'null'],
          description:
            'The fixed input SOL amount to copy trade, Either this or "percentage" must be provided ',
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
  formatParameters: async (runtime: IAgentRuntime, parameters: any, callback?: HandlerCallback) => {
    const formattedParameters = convertNullStrings(parameters) as CopyTradeParameters;
    if (!formattedParameters.name) {
      formattedParameters.name = `COPY_TRADE-${formattedParameters.walletAddress}`;
    }
    formattedParameters.fixedAmount = Number(formattedParameters.fixedAmount);
    formattedParameters.percentage = Number(formattedParameters.percentage);
    if (!isValidAddress(formattedParameters.targetAddress)) {
      callback?.({
        text: `Please provide a valid wallet address to copy trade.`,
        action: 'COPY_TRADE',
      });
      return {status: 'incomplete info', parameters: formattedParameters};
    }
    if (Number.isFinite(formattedParameters.fixedAmount) && formattedParameters.fixedAmount > 0) {
      formattedParameters.mode = 'fixedAmount';
    } else if (
      Number.isFinite(formattedParameters.percentage) &&
      formattedParameters.percentage > 0 &&
      formattedParameters.percentage <= 1
    ) {
      formattedParameters.mode = 'percentage';
    } else {
      callback?.({
        text: `Please provide a valid input amount or percentage to copy trade.`,
        action: 'COPY_TRADE',
      });
      return {status: 'incomplete info', parameters: formattedParameters};
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
    // check if the swap request is from agent owner or public chat
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      callback?.(NotAgentAdminResponse);
      return 'rejected';
    }

    let response = convertNullStrings(
      state.actionParameters,
    ) as CopyTradeParameters;

    const wallet = await getWalletKey(runtime, true);
    response.walletAddress = wallet.keypair.publicKey.toBase58();
    response.agentId = runtime.agentId;
    response.chain = 'solana';
    const records = await runtime.databaseAdapter.find?.('copyTrades', {
      agentId: response.agentId,
      chain: response.chain,
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

    if (response.pendingConfirmation === true) {
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
      } else if (confirmResponse.userAcked == "pending") {
        callback?.({
          text: "I repeatedly asked you to confirm the task although you have already confirmed it. It was my mistake. Please try again.",
          action: "COPY_TRADE"
        });
        return "pending";
      } else if (confirmResponse.userAcked == "confirmed") {
        const { id } = await SharedProvider.get<any>(
          'tradeMonitorService',
        ).createCopyTrade({
          chain: response.chain,
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
      } else {
        callback?.({
          text: "I failed to recognize your confirmation. Please try again.",
          action: "COPY_TRADE"
        });
        return "failed";
      }
    } else {
      const responseMsg = {
        text: `${formatConfirmMessage(response)}`,
        result: 'Pending user confirmation',
        action: 'COPY_TRADE',
      };
      callback?.(responseMsg);
      return 'pending';
    }

  },

  examples: [] as ActionExample[][],
} as Action;

function formatConfirmMessage(response: CopyTradeParameters): string {
  const buyInfo = Number.isFinite(response.fixedAmount)
    ? `Buy amount: ${response.fixedAmount} SOL`
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
