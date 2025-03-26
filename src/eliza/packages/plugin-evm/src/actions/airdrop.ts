import {
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type ActionStatus,
  type Action,
  elizaLogger,
} from '@elizaos/core';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';

export const airdrop: Action = {
  functionCallSpec: {
    name: 'CLAIM_AIRDROP',
    strict: true,
    additionalProperties: false,
    description: 'Perform claim airdrop for the user agent account',
    parameters: {
      type: 'object',
      properties: {
        programName: {
          type: ['string', 'null'],
          description: 'The program name of the airdrop',
        },
      },
      required: ['programName'],
    },
  },
  name: 'CLAIM_AIRDROP',
  similes: [],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description: 'Perform claim airdrop for the user agent account',
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
    try {
      const responseMsg = {
        text: `You have no airdrop available now.`,
      };
      callback?.(responseMsg);
      return 'success';
    } catch (error) {
      elizaLogger.error(`Error during claim airdrop ${error}`);
      const responseMsg = {
        text: `Error during claim airdrop: ${error}`,
      };
      callback?.(responseMsg);
      return 'failed';
    }
  },
  examples: [] as ActionExample[][],
} as Action;