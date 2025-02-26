import {
  type ActionExample,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action, composeContext, generateObjectDeprecated, ModelClass, elizaLogger,
} from '@elizaos/core';
import { convertNullStrings } from './swapUtils.js';
import { getWalletPortfolio } from '../providers/walletUtils.js';
import { getWalletKey } from '../keypairUtils.js';

const analyzeTokenTemplate = `
#Task
You are an expert on crypto currency, and have a wallet on solana. Extract the query type from recent messages below that user want to know about his wallet.
{
    "queryType": "walletBalance" | "tokenBalance",
    "tokenSymbol": string | null,
    "tokenAddress": string | null,
}

{{recentMessages}}
`
export const walletPortfolio: Action = {
  name: 'WALLET_PORTFOLIO',
  suppressInitialMessage: true,
  similes: ['WALLET_INFO'],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description: "Get the wallet total balance or specific token balance in agent wallet",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<boolean> => {
    const context = composeContext({
      state,
      template: analyzeTokenTemplate,
    });
    let response = await generateObjectDeprecated({
      runtime,
      context: context,
      modelClass: ModelClass.LARGE,
    });
    response = convertNullStrings(response);
    elizaLogger.log('WALLET_PORTFOLIO Response:', response);

    const {publicKey} = await getWalletKey(runtime, false);
    const portfolio = await getWalletPortfolio(runtime, publicKey.toBase58());
    switch (response.queryType) {
      case 'walletBalance':
        callback?.({
          text: `Your wallet balance is ${portfolio?.totalUsd} USD.`,
        });
        return;
      case 'tokenBalance':
        const tokenInfo = portfolio?.items.find((item) => (item.symbol === response.tokenSymbol || item.address === response.tokenAddress));
        callback?.({
          text: `${response.tokenSymbol} balance in my wallet is ${tokenInfo?.uiAmount}, it is worth $${tokenInfo?.valueUsd} now.`,
        });
        return;
      default:
        callback?.({
          text: `Sorry, I don't support the query now`,
        });
    }
    return true;
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
