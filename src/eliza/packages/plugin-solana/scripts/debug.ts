import { startAgents } from '@elizaos/agent';

import { solanaPlugin } from '../dist/index.js';

const plugins: { name: string; description: string }[] = [solanaPlugin];

startAgents(plugins).catch((error) => {
    console.error('Unhandled error in startAgents:', error);
    process.exit(1);
});
