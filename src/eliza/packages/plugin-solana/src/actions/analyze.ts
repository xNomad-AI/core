import {
  type ActionExample,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action, composeContext, generateObjectDeprecated, ModelClass, elizaLogger,
} from '@elizaos/core';
import { convertNullStrings } from '../providers/swapUtils.js';
import { getTokensBySymbol } from '../providers/tokenUtils.js';

const analyzeTokenTemplate = `
#Task
You are an expert on crypto currency, extract the token symbol or contract address from recent messages below that user want to analyze.
Respond a json object of the analyze token symbol or contract, if field not found, set field value to null.
- tokenSymbol: The token symbol to analyze, at least one of tokenSymbol or tokenAddress should be provided.
- tokenAddress: The token contract address to analyze, should be a 44 character string, at least one of tokenSymbol or tokenAddress should be provided.
- analyze: The types of analysis to perform, shoule be an array, items can be "info", "news", "twitter", default to ["info", "twitter", "news"].
{
    "tokenSymbol": string | null,
    "tokenAddress": string | null,
    "analyze": ["info" | "news" | "twitter"]
}

{{recentMessages}}
`
export const analyze: Action = {
  name: 'ANALYZE_TOKEN',
  suppressInitialMessage: true,
  similes: ['ANALYZE_TOKEN_INFO', 'TOKEN_REPORT'],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description: "Analyze the token trade info, twitter binding and news about the token by given symbol or contract address",
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
    elizaLogger.log('ANALYZE_TOKEN Response:', response);

    if (response.tokenSymbol && !response.tokenAddress){
      const tokens = await getTokensBySymbol(runtime, response.tokenSymbol);
      response.tokenAddress = tokens[0]?.address;
    }

    if (!response.tokenAddress) {
      callback?.({
        text: `Please provide either token symbol or contract address to analyze.`,
      });
      return;
    }

    const analyzeResult = await getTokenInfo(response.tokenSymbol, response.tokenAddress, response.analyze);

    callback?.({
      text: `token: ${response.tokenSymbol || response.tokenAddress}`,
      action: `ANALYZE_TOKEN`,
      webAction: 'analyze',
      data: {
        ...analyzeResult,
      }
    });
    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: '$HOOD',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: '$HOOD, a memecoin inspired by Robinhood, aims to offer wealth and financial freedom. Its narrative focuses on empowering the average investor.',
          action: 'ANALYZE_TOKEN',
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

async function getTokenInfo(
  tokenSymbol: string | null,
  tokenAddress: string | null,
  analyzeTypes: ['info' | 'news' | 'twitter'],
){
  const params = new URLSearchParams();
  if (tokenAddress) params.append('tokenAddress', tokenAddress);
  if (analyzeTypes.length) params.append('type', analyzeTypes.join(','));
  const response = await fetch(`http://localhost:8080/token/analyze?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return await response.json();
}