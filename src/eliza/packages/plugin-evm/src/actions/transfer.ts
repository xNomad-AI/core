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
import { convertNullStrings, getRuntimeDefaultChain, getRuntimeKey, trimTokenSymbol } from '../providers/environment.js';
import { transferToken } from '../providers/transferUtils.js';
import { EVMClient, nativeTokenAddress } from '../providers/evmClient.js';
import { userConfirmTemplate } from '../providers/type.js';

export interface TransferContent {
  tokenAddress: string | null;
  tokenSymbol: string | null;
  recipient: string;
  amount: number | null;
  percentage?: number | string;
}

export const transfer: Action = {
  name: 'SEND_TOKEN',
  suppressInitialMessage: true,
  functionCallSpec: {
    name: 'SEND_TOKEN',
    strict: true,
    additionalProperties: false,
    description:
      'EVM Token transfers: Transfer native or ERC20 tokens from agent wallet to another address.',
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
            'The token contract address to transfer, at lease one of tokenSymbol or tokenAddress is provided. Set it null if you are not sure.',
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
    "Transfer EVM blockchain native currency or ERC20 Tokens from agent's wallet to another address, aka [send |withdraw|transfer] [amount] [tokenSymbol] [tokenCA] to [address] ",
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
    
    const chain = getRuntimeDefaultChain(runtime);
    const rpcUrl = getRuntimeKey(runtime, `${chain.toUpperCase()}_RPC_URL`);
    const evmClient = new EVMClient({
      rpcUrl,
      chainName: chain,
    });
    const { address, privateKey } = await getWalletKey(runtime, true);

    if (evmClient.isNativeToken(content.tokenSymbol)) {
      content.tokenAddress = nativeTokenAddress;
    }

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

    const uiBalance = await evmClient.getTokenUIBalance(content.tokenAddress, address);
    if (Number(uiBalance) < content.amount) {
      callback({
        text: `Insufficient balance for transfer`,
      });
      return 'pending';
    }
    content.percentage = ((content.amount / Number(uiBalance)) * 100).toFixed(3);

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

    if (confirmResponse.userAcked == 'pending') {
      callback({
        text: formatTransferInfo(address, content),
      });
      return 'pending';
    }

    if (confirmResponse.userAcked == 'rejected') {
      const responseMsg = {
        text: 'ok. I will not execute this transaction.',
      };
      callback?.(responseMsg);
      return 'success';
    }

    
    elizaLogger.info(
      `${address} start transfer content:`,
      content,
    );

    
    let txHash: string;
    try {
      txHash = await transferToken({
        rpcUrl: rpcUrl,
        uiAmount: content.amount.toString(),
        privateKey: privateKey,
        recipient: content.recipient,
        tokenAddress: content.tokenAddress,
        chainName: chain,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes('Transfer is restricted')) {
        callback?.({
          text: `Due to Transfer Restrictions, this token is not allowed to transfer. Please contact the token creator for more information.`,
          isError: true,
        });
        return 'failed';
      }
      throw e;
    }

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
  const displayTokenAddress = content.tokenAddress != nativeTokenAddress ? `(${content.tokenAddress})` : '';
  return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
➡️ Type: Transfer
🪙 Token: ${displayTokenSymbol} ${displayTokenAddress}
💰 Amount: ${content.amount} (${content.percentage}%)
💼 From: ${from}
💼 To: ${content.recipient}
————
Reply 'ok' or 'yes' to confirm.`;
}
