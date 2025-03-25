import type { Plugin } from '@elizaos/core';
import { walletPortfolio } from './actions/wallet.js';
import { transfer } from './actions/transfer.js';
import { SwapTokenService } from './providers/swapTokenService.js';
import { EVMClient } from './providers/evmClient.js';
export {
  EVMClient,
  SwapTokenService,
};

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
