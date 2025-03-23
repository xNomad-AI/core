import type { Plugin } from '@elizaos/core';
import { walletPortfolio } from './actions/wallet.js';
import { transfer } from './actions/transfer.js';

export const evmPlugin: Plugin = {
  name: 'evm',
  description: 'EVM Plugin for Eliza',
  actions: [
    transfer,
    walletPortfolio,
  ],
  evaluators: [],
  providers: [],
};
export default evmPlugin;
