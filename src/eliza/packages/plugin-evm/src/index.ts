import type { Plugin } from '@elizaos/core';
import { walletPortfolio } from './actions/wallet.js';
import { transfer } from './actions/transfer.js';
import { SwapTokenService } from './providers/swapTokenService.js';
import { EVMClient, nativeTokenAddress } from './providers/evmClient.js';
import { analyze } from './actions/analyze.js';
import { executeSwap } from './actions/swap.js';
import { copyTrade } from './actions/copyTrade.js';
import { autoTask } from './actions/autoSwap.js';
import { airdrop } from './actions/airdrop.js';
import { getAccountFromWalletService } from './providers/keypairUtils.js';
import { getWalletPortfolio, WalletPortfolio, Item } from './providers/walletUtils.js';
import createToken from './actions/createToken.js';

export {
  EVMClient,
  SwapTokenService,
  getAccountFromWalletService,
  nativeTokenAddress,
  getWalletPortfolio,
  WalletPortfolio,
  Item,
};

export const evmPlugin: Plugin = {
  name: 'evm',
  description: 'EVM Plugin for Eliza',
  actions: [
    transfer,
    walletPortfolio,
    analyze,
    executeSwap,
    copyTrade,
    autoTask,
    airdrop,
    createToken,
  ],
  evaluators: [],
  providers: [],
};
export default evmPlugin;

export class SharedProvider {
  private static instances = new Map<string, any>();

  public static set<T>(name, instance: T) {
    this.instances.set(name, instance);
  }

  public static get<T>(name: string): T {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`Service ${name} is not initialized.`);
    }
    return instance;
  }
}
