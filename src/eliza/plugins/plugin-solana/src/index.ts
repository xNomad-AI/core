import {AgentRuntime, elizaLogger, IAgentRuntime, stringToUuid} from "@elizaos/core";

export * from "./providers/token.js";
export * from "./providers/wallet.js";
import type { Plugin } from "@elizaos/core";
import { TokenProvider } from "./providers/token.js";
import { WalletProvider } from "./providers/wallet.js";
import { getTokenBalance, getTokenBalances } from "./providers/tokenUtils.js";
import { walletProvider } from "./providers/wallet.js";
import { executeSwap } from "./actions/swap.js";
import {autoExecuteSwap, checkAutoSwapTask} from "./actions/autoSwap.js";
import pumpfun from "./actions/pumpfun.js";
import {airdrop} from "./actions/airdrop.js";
export { TokenProvider, WalletProvider, getTokenBalance, getTokenBalances };
export const solanaPlugin: Plugin = {
    name: "solana",
    description: "Solana Plugin for Eliza",
    actions: [
        // transferToken,
        // transferSol,
        executeSwap,
        pumpfun,
        autoExecuteSwap,
        airdrop,
        // fomo,
        // executeSwapForDAO,
        // take_order,
    ],
    evaluators: [],
    providers: [walletProvider],
};
export default solanaPlugin;

export async function createSolanaPlugin(runtime: IAgentRuntime): Promise<Plugin>{
    // start a loop that runs every x seconds
    setInterval(
        async () => {
            // await checkAutoSwapTask(runtime)
        },
        20000
    );
    return {
        name: "solana",
        description: "Solana Plugin for Eliza",
        actions: [
            // transferToken,
            // transferSol,
            executeSwap,
            pumpfun,
            autoExecuteSwap,
            airdrop,
            // fomo,
            // executeSwapForDAO,
            // take_order,
        ],
        evaluators: [],
        providers: [walletProvider],
    };
}