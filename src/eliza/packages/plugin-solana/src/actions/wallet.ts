import {
  type ActionExample,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action,
  composeContext,
  generateObjectDeprecated,
  ModelClass,
  elizaLogger,
  ActionStatus,
} from '@elizaos/core';
import { convertNullStrings } from '../providers/swapUtils.js';
import { getWalletPortfolio } from '../providers/walletUtils.js';
import { getWalletKey } from '../keypairUtils.js';

export const walletPortfolio: Action = {
  functionCallSpec: {
    name: 'WALLET_PORTFOLIO',
    strict: true,
    additionalProperties: false,
    description:
      'Get the wallet total balance or specific token balance in agent wallet',
    parameters: {
      type: 'object',
      properties: {
        queryType: {
          type: ['string', 'null'],
          description:
            'The type of query, should be "walletBalance" or "tokenBalance", default is walletBalance',
        },
        tokenSymbol: {
          type: ['string', 'null'],
          description:
            'The token symbol to query, at lease one of tokenSymbol or tokenAddress should be provided when queryType is "tokenBalance"',
        },
        tokenAddress: {
          type: ['string', 'null'],
          description:
            'The token contract address to query, at lease one of tokenSymbol or tokenAddress should be provided when queryType is "tokenBalance"',
        },
      },
      required: ['queryType', 'tokenSymbol', 'tokenAddress'],
    },
  },
  name: 'WALLET_PORTFOLIO',
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description:
    'Get the wallet total balance or specific token balance in agent wallet',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionStatus> => {
    const response = convertNullStrings(state.actionParameters) as any;
    elizaLogger.log('WALLET_PORTFOLIO Response:', response);

    const { publicKey } = await getWalletKey(runtime, false);
    const portfolio = await getWalletPortfolio(runtime, publicKey.toBase58());
    switch (response.queryType) {
      case 'walletBalance':
        callback?.({
          text: `Your wallet balance is ${portfolio?.totalUsd} USD.`,
          result: `Query success, portfolio: ${JSON.stringify(portfolio)}`,
        });
        return 'success';
      case 'tokenBalance':
        const tokenInfo = portfolio?.items.find(
          (item) =>
            item.symbol === response.tokenSymbol ||
            item.address === response.tokenAddress,
        );
        callback?.({
          text: `${response.tokenSymbol} balance in my wallet is ${tokenInfo?.uiAmount}, it is worth $${tokenInfo?.valueUsd} now.`,
          result: `Query success, ${response.tokenSymbol} balance in my wallet is ${tokenInfo?.uiAmount}, it is worth $${tokenInfo?.valueUsd} now.`,
        });
        return 'success';
      default:
        callback?.({
          text: `Sorry, I don't support the query now`,
        });
        return 'failed';
    }
    return 'success';
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'How much ai16z do you have in wallet',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: `ai16z holding in my wallet is 105.93, it is worth $1.05 now.`,
          action: 'WALLET_PORTFOLIO',
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
