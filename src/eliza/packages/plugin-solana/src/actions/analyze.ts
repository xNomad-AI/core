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
  elizaLogger, ActionStatus,
} from '@elizaos/core';
import { convertNullStrings } from '../providers/swapUtils.js';
import { getTokensBySymbol } from '../providers/tokenUtils.js';
export const analyze: Action = {
  functionCallSpec: {
    name: 'ANALYZE_TOKEN',
    strict: true,
    additionalProperties: false,
    description:
      'Analyze the token trade info, twitter binding and news about the token by given symbol or contract address',
    parameters: {
      type: 'object',
      properties: {
        tokenSymbol: {
          type: ['string', 'null'],
          description:
            'The token symbol to analyze, at least one of tokenSymbol or tokenAddress should be provided',
        },
        tokenAddress: {
          type: ['string', 'null'],
          description:
            'The token contract address to analyze, should be a 44 character string, at least one of tokenSymbol or tokenAddress should be provided',
        },
        analyze: {
          type: ['array', 'null'],
          description:
            'The types of analysis to perform, shoule be an array, items can be "info", "news", "twitter", default to ["info", "twitter", "news"]',
        },
      },
      required: ['tokenSymbol', 'tokenAddress', 'analyze'],
    },
  },
  name: 'ANALYZE_TOKEN',
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description:
    'Analyze the token trade info, twitter binding and news about the token by given symbol or contract address',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionStatus> => {
    let response = convertNullStrings(state.actionParameters) as any;
    elizaLogger.log('ANALYZE_TOKEN Response:', response);

    if (response.tokenSymbol && !response.tokenAddress) {
      const tokens = await getTokensBySymbol(runtime, response.tokenSymbol);
      response.tokenAddress = tokens?.[0]?.address;
    }

    if (!response.tokenAddress) {
      callback?.({
        text: `Please provide either token symbol or contract address to analyze.`,
      });
      return 'pending';
    }

    const analyzeResult = await getTokenInfo(
      response.tokenSymbol,
      response.tokenAddress,
      response.analyze,
    );

    const isSuccess = analyzeResult.success;
    if (!isSuccess) {
      callback?.({
        text: `Failed to analyze the token: ${analyzeResult.error}`,

      });
      return 'failed';
    }

    const data = analyzeResult.data;
    callback?.({
      text: `token: ${response.tokenSymbol || response.tokenAddress}\n${JSON.stringify(data)}`,
      result: `Successfully analyzed the token: ${response.tokenSymbol ? 
        (response.tokenAddress ? `${response.tokenSymbol} (${response.tokenAddress})` : response.tokenSymbol) 
        : response.tokenAddress}`,
      status: 'success',
      action: `ANALYZE_TOKEN`,
      webAction: 'analyze',
      data: {
        ...data,
      },
    });
    return 'success';
  },
  examples: [] as ActionExample[][],
} as Action;

async function getTokenInfo(
  tokenSymbol: string | null,
  tokenAddress: string | null,
  analyzeTypes: ['info' | 'news' | 'twitter'],
) {
  try {
    const params = new URLSearchParams();
    if (tokenAddress) params.append('tokenAddress', tokenAddress);
    if (analyzeTypes.length) params.append('type', analyzeTypes.join(','));

    const response = await fetch(
      `http://localhost:8080/token/analyze?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data) {
      throw new Error('No data received from server');
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred',
      data: null,
    };
  }
}
