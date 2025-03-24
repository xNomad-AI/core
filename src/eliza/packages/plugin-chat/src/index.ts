import type { Plugin } from '@elizaos/core';
import { none } from './actions/none.js';

export const chatPlugin: Plugin = {
  name: 'chat',
  description: 'Chat Plugin for Eliza',
  actions: [
    none,
  ],
  evaluators: [],
  providers: [],
};
export default chatPlugin;
