import { ActionStatus, elizaLogger } from '@elizaos/core';
import {
  type ActionExample,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelClass,
  type State,
  type Action,
  generateObjectDeprecated,
  composeContext,
} from '@elizaos/core';
import { getWalletKey } from '../providers/keypairUtils.js';
import {
  getWalletTokenBySymbol,
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import { convertNullStrings, getRuntimeKey, trimTokenSymbol } from '../providers/environment.js';
import { transferToken } from '../providers/transferUtils.js';

export interface TransferContent extends Content {
  tokenAddress: string | null;
  tokenSymbol: string | null;
  recipient: string;
  amount: number | null;
}

const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user's response to the transfer confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
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
•If the user issues a new transfer instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•Analyze the last five messages to understand the user’s intent in context.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Transfer 0.0001 SOL to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Transfer 1 ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

❓ **Should return \`"pending"\`**  
- User1: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7"  

- User1: "withdraw"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;

export const transfer: Action = {
  name: 'SEND_TOKEN',
  suppressInitialMessage: true,
  functionCallSpec: {
    name: 'SEND_TOKEN',
    strict: true,
    additionalProperties: false,
    description:
      'EVM transfers: Transfer native or ERC20 tokens from agent wallet to another address, if tokenSymbol is native token of the chain, tokenAddress should be 0x0000000000000000000000000000000000000000',
    parameters: {
      type: 'object',
      properties: {
        tokenSymbol: {
          type: ['string', 'null'],
          description:
            'The token symbol to transfer, at lease one of tokenSymbol or tokenAddress is provided',
        },
        tokenAddress: {
          type: ['string', 'null'],
          description:
            'The token contract address to transfer, at lease one of tokenSymbol or tokenAddress is provided',
        },
        recipient: {
          type: 'string',
          description: 'The recipient wallet address',
        },
        amount: {
          type: 'string',
          description: 'The number amount of tokens to transfer',
        },
      },
      required: ['tokenSymbol', 'tokenAddress', 'recipient', 'amount'],
    },
  },
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description:
    "Transfer ERC20 Tokens from agent's wallet to another address, aka [send |withdraw|transfer] [amount] [tokenSymbol] [tokenCA] to [address] ",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionStatus> => {
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      callback?.(NotAgentAdminResponse);
      return 'rejected';
    }
    const content = convertNullStrings(
      state.actionParameters,
    ) as TransferContent;

    if (!content.amount || isNaN(content.amount as number)) {
      callback({
        text: `Please provide the amount of tokens to transfer`,
      });
      return 'pending';
    }

    if (!content.recipient) {
      callback({
        text: `Please provide the address to transfer the tokens to`,
      });
      return 'pending';
    }
    
    const chain = getRuntimeKey(runtime, 'NFT_CHAIN');
    const rpcUrl = getRuntimeKey(runtime, `${'chain'.toUpperCase()}_RPC_URL`);
    const { address, privateKey } = await getWalletKey(runtime, true);

    if (!content.tokenAddress) {
      const walletToken = await getWalletTokenBySymbol(
        runtime,
        address,
        content.tokenSymbol,
      );
      content.tokenAddress = walletToken?.address;
      if (!content.tokenAddress) {
        callback({
          text: `Please provide the token CA to transfer`,
        });
        return 'pending';
      }
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
      const responseMsg = {
        text: 'ok. I will not execute this transaction.',
      };
      callback?.(responseMsg);
      return 'success';
    }

    
    elizaLogger.log(
      `${address} start transfer content:`,
      content,
    );

    const txHash = await transferToken({
      rpcUrl: rpcUrl,
      amount: content.amount.toString(),
      privateKey: privateKey,
      recipient: content.recipient,
      tokenAddress: content.tokenAddress,
      chainName: 'bsc',
    });

    callback?.({
      text: `Successfully sent ${content.amount} ${content.tokenSymbol || content.tokenAddress} to ${content.recipient}.\n\nTransaction hash: ${txHash}`,
      content: {
        success: true,
        signature: txHash,
        amount: content.amount,
        recipient: content.recipient,
      },
    });
    return 'success';
  },

  examples: [] as ActionExample[][],
} as Action;

function formatTransferInfo(from: string, content): string {
  const displayTokenSymbol = trimTokenSymbol(`$${content.tokenSymbol}`);
  return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
➡️ Type: Transfer
🪙 Token: ${displayTokenSymbol} (${content.tokenAddress})
💰 Amount: ${content.amount} (${content.transferPercentage}%)
💼 From: ${from}
💼 To: ${content.recipient}
————
Reply 'ok' or 'yes' to confirm.`;
}
