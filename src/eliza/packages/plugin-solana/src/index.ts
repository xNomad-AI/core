import type { Plugin } from '@elizaos/core';
import { getTokenBalance, getTokenBalances } from './providers/tokenUtils.js';
import { executeSwap } from './actions/swap.js';
import { autoTask } from './actions/autoSwap.js';
import pumpfun from './actions/pumpfun.js';
import { airdrop } from './actions/airdrop.js';
import { transfer } from './actions/transfer.js';
import {analyze} from './actions/analyze.js';
import { walletPortfolio } from './actions/wallet.js';
import { none } from './actions/none.js';
export { getTokenBalance, getTokenBalances };
export const solanaPlugin: Plugin = {
  name: 'solana',
  description: 'Solana Plugin for Eliza',
  actions: [none, walletPortfolio, analyze, transfer, executeSwap, pumpfun, autoTask, airdrop],
  evaluators: [],
  providers: [],
};
export default solanaPlugin;
export {
  AutoSwapTaskTable,
  executeAutoTokenSwapTask,
  AutoSwapTask,
} from './actions/autoSwap.js';
