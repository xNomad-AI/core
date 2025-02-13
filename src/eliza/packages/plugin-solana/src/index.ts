import {
  AgentRuntime,
  elizaLogger,
  IAgentRuntime,
  stringToUuid,
} from '@elizaos/core';

export * from './providers/token.js';
export * from './providers/wallet.js';
import type { Plugin } from '@elizaos/core';
import { TokenProvider } from './providers/token.js';
import { WalletProvider } from './providers/wallet.js';
import { getTokenBalance, getTokenBalances } from './providers/tokenUtils.js';
import { walletProvider } from './providers/wallet.js';
import { executeSwap } from './actions/swap.js';
import { autoTask } from './actions/autoSwap.js';
import pumpfun from './actions/pumpfun.js';
import { airdrop } from './actions/airdrop.js';
export { TokenProvider, WalletProvider, getTokenBalance, getTokenBalances };
export const solanaPlugin: Plugin = {
  name: 'solana',
  description: 'Solana Plugin for Eliza',
  actions: [executeSwap, pumpfun, autoTask, airdrop],
  evaluators: [],
  providers: [walletProvider],
};
export default solanaPlugin;
export {
  AutoSwapTaskTable,
  executeAutoTokenSwapTask,
  AutoSwapTask,
} from './actions/autoSwap.js';
