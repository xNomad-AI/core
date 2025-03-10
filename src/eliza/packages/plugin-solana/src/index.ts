import type { Plugin } from '@elizaos/core';
import { getTokenBalance, getTokenBalances } from './providers/tokenUtils.js';
import { getWalletKeyFromWalletService}  from './keypairUtils.js';
import { SolanaClient } from './providers/solana-client.js';
import { executeSwap } from './actions/swap.js';
import { autoTask } from './actions/autoSwap.js';
import pumpfun from './actions/pumpfun.js';
import { airdrop } from './actions/airdrop.js';
import { transfer } from './actions/transfer.js';
import {analyze} from './actions/analyze.js';
import { walletPortfolio } from './actions/wallet.js';
import { none } from './actions/none.js';
import { copyTrade } from './actions/copyTrade';
export { getTokenBalance, getTokenBalances, getWalletKeyFromWalletService, SolanaClient };
export const solanaPlugin: Plugin = {
  name: 'solana',
  description: 'Solana Plugin for Eliza',
  actions: [none, walletPortfolio, analyze, transfer, executeSwap, pumpfun, autoTask, airdrop, copyTrade],
  evaluators: [],
  providers: [],
};
export default solanaPlugin;
export {
  AutoSwapTaskTable,
  executeAutoTokenSwapTask,
  AutoSwapTask,
} from './actions/autoSwap.js';


export class SharedProvider {
  private static instances = new Map<string, any>();

  public static set<T>(name, instance: T) {
    this.instances.set(name, instance);
  }

  public static get<T>(name: string) : T {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`Service ${name} is not initialized.`);
    }
    return instance;
  }
}