import {
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action,
  elizaLogger,
  ActionStatus,
} from '@elizaos/core';
import { convertNullStrings, getRuntimeKey } from '../providers/environment.js';
import { getWalletPortfolio } from '../providers/walletUtils.js';
import { getWalletKey } from '../providers/keypairUtils.js';

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

    const { address } = await getWalletKey(runtime, false);
    const portfolio = await getWalletPortfolio(runtime, address, getRuntimeKey(runtime, 'NFT_CHAIN'));
    switch (response.queryType) {
      case 'walletBalance':
        callback?.({
          text: `Your wallet balance is ${portfolio?.totalUsd} USD.`,
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

  examples: [] as ActionExample[][],
} as Action;
