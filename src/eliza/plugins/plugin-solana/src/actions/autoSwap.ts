import {
    type ActionExample,
    composeContext,
    generateObjectDeprecated,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    settings,
    type State,
    type Action,
    elizaLogger, Content, stringToUuid,
} from "@elizaos/core";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { getWalletKey } from "../keypairUtils.js";
import { walletProvider, WalletProvider } from "../providers/wallet.js";
import {md5sum} from "./swapUtils.js";
import {swapToken} from "./swap.js";


interface AutoSwapTask {
    inputTokenSymbol: string | null;
    outputTokenSymbol: string | null;
    inputTokenCA: string | null;
    outputTokenCA: string | null;
    amount: number | string | null;
    delay: string | null;
    startAt: Date;
    expireAt: Date;
    price: number | null;
}

const autoSwapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "inputTokenSymbol": "SOL",
    "outputTokenSymbol": "ELIZA",
    "inputTokenCA": "So11111111111111111111111111111111111111112",
    "outputTokenCA": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "amount": 0.1,
    "delay": "300s",
    "price": "0.016543"
}
\`\`\`

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token swap:
- Input token symbol (the token being sold)
- Output token symbol (the token being bought)
- Input token contract address if provided
- Output token contract address if provided
- Amount to swap
- Delay if provided
- Price if provided

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "inputTokenSymbol": string | null,
    "outputTokenSymbol": string | null,
    "inputTokenCA": string | null,
    "outputTokenCA": string | null,
    "amount": number | string | null,
    "delay": string | null,
    "price": number | null
}
\`\`\``;

// if we get the token symbol but not the CA, check walet for matching token, and if we have, get the CA for it

// get all the tokens in the wallet using the wallet provider
async function getTokensInWallet(runtime: IAgentRuntime) {
    const { publicKey } = await getWalletKey(runtime, false);
    const walletProvider = new WalletProvider(
        new Connection("https://api.mainnet-beta.solana.com"),
        publicKey
    );

    const walletInfo = await walletProvider.fetchPortfolioValue(runtime);
    const items = walletInfo.items;
    return items;
}

// check if the token symbol is in the wallet
async function getTokenFromWallet(runtime: IAgentRuntime, tokenSymbol: string) {
    try {
        const items = await getTokensInWallet(runtime);
        const token = items.find((item) => item.symbol === tokenSymbol);

        if (token) {
            return token.address;
        } else {
            return null;
        }
    } catch (error) {
        elizaLogger.error("Error checking token in wallet:", error);
        return null;
    }
}

export async function checkAutoSwapTask(runtime: IAgentRuntime){
    elizaLogger.log("start checkAutoSwapTask...");
    const memories = await runtime.databaseAdapter.getMemories({
        agentId: runtime.agentId,
        roomId: stringToUuid('AUTO_TOKEN_SWAP_TASK'),
        tableName: 'AUTO_TOKEN_SWAP_TASK',
    })
    for (const memory of memories){
        await executeAutoSwapTask(runtime, memory);
    }
}

async function executeAutoSwapTask(runtime: IAgentRuntime, memory: Memory){
    const {content, id} = memory;
    const task = content.task as AutoSwapTask;
    elizaLogger.log("executeAutoSwapTask", task);
    // TODO check price matched
    if (task.startAt && task.startAt > new Date()) {
        elizaLogger.log("Task is not ready to start yet");
        return;
    }
    if (task.expireAt && task.expireAt <= new Date()) {
        elizaLogger.log(`Task has expired ${id}`);
        await runtime.databaseAdapter.removeMemory(id, 'AUTO_SWAP_TOKEN_TASK');
    }
    const connection = new Connection(
        runtime.getSetting("SOLANA_RPC_URL") || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    );
    const { publicKey: walletPublicKey } = await getWalletKey(
        runtime,
        false
    );

    // const provider = new WalletProvider(connection, walletPublicKey);

    elizaLogger.log("Wallet Public Key:", walletPublicKey);
    elizaLogger.log("inputTokenSymbol:", task.inputTokenCA);
    elizaLogger.log("outputTokenSymbol:", task.outputTokenCA);
    elizaLogger.log("amount:", task.amount);

    const swapResult = await swapToken(
        connection,
        walletPublicKey,
        task.inputTokenCA as string,
        task.outputTokenCA as string,
        task.amount as number
    );

    elizaLogger.log("Deserializing transaction...");
    const transactionBuf = Buffer.from(
        swapResult.swapTransaction,
        "base64"
    );
    const transaction =
        VersionedTransaction.deserialize(transactionBuf);

    elizaLogger.log("Preparing to sign transaction...");

    elizaLogger.log("Creating keypair...");
    const { keypair } = await getWalletKey(runtime, true);
    elizaLogger.log(`Keypair created:, keypair.publicKey.toBase58()`);
    // Verify the public key matches what we expect
    if (keypair.publicKey.toBase58() !== walletPublicKey.toBase58()) {
        throw new Error(
            "Generated public key doesn't match expected public key"
        );
    }

    elizaLogger.log("Signing transaction...");
    transaction.sign([keypair]);

    elizaLogger.log("Sending transaction...");

    // const latestBlockhash = await connection.getLatestBlockhash();

    const txid = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
    });

    elizaLogger.log("Transaction sent:", txid);
    await runtime.databaseAdapter.removeMemory(id, 'AUTO_SWAP_TOKEN_TASK');
}

// swapToken should took CA, not symbol

export const autoExecuteSwap: Action = {
    name: "AUTO_EXECUTE_SWAP",
    similes: ["AUTO_SWAP_TOKENS", "AUTO_TOKEN_SWAP", "AUTO_TRADE_TOKENS", "AUTO_EXCHANGE_TOKENS"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        elizaLogger.log("Message:", message);
        return true;
    },
    description: "Perform auto token swap.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const walletInfo = await walletProvider.get(runtime, message, state);

        state.walletInfo = walletInfo;

        const swapContext = composeContext({
            state,
            template: autoSwapTemplate,
        });

        const response = await generateObjectDeprecated({
            runtime,
            context: swapContext,
            modelClass: ModelClass.LARGE,
        }) as AutoSwapTask;

        elizaLogger.log("Response:", response);
        // const type = response.inputTokenSymbol?.toUpperCase() === "SOL" ? "buy" : "sell";

        // Add SOL handling logic
        if (response.inputTokenSymbol?.toUpperCase() === "SOL") {
            response.inputTokenCA = settings.SOL_ADDRESS;
        }
        if (response.outputTokenSymbol?.toUpperCase() === "SOL") {
            response.outputTokenCA = settings.SOL_ADDRESS;
        }

        // if both contract addresses are set, lets execute the swap
        // TODO: try to resolve CA from symbol based on existing symbol in wallet
        if (!response.inputTokenCA && response.inputTokenSymbol) {
            elizaLogger.log(
                `Attempting to resolve CA for input token symbol: ${response.inputTokenSymbol}`
            );
            response.inputTokenCA = await getTokenFromWallet(
                runtime,
                response.inputTokenSymbol
            );
            if (response.inputTokenCA) {
                elizaLogger.log(
                    `Resolved inputTokenCA: ${response.inputTokenCA}`
                );
            } else {
                elizaLogger.log(
                    "No contract addresses provided, skipping swap"
                );
                const responseMsg = {
                    text: "I need the contract addresses to perform the swap",
                };
                callback?.(responseMsg);
                return true;
            }
        }

        if (!response.outputTokenCA && response.outputTokenSymbol) {
            elizaLogger.log(
                `Attempting to resolve CA for output token symbol: ${response.outputTokenSymbol}`
            );
            response.outputTokenCA = await getTokenFromWallet(
                runtime,
                response.outputTokenSymbol
            );
            if (response.outputTokenCA) {
                elizaLogger.log(
                    `Resolved outputTokenCA: ${response.outputTokenCA}`
                );
            } else {
                elizaLogger.log(
                    "No contract addresses provided, skipping swap"
                );
                const responseMsg = {
                    text: "I need the contract addresses to perform the swap",
                };
                callback?.(responseMsg);
                return true;
            }
        }

        if (!response.amount) {
            elizaLogger.log("No amount provided, skipping swap");
            const responseMsg = {
                text: "I need the amount to perform the swap",
            };
            callback?.(responseMsg);
            return true;
        }

        if (!response.price && !response.delay) {
            elizaLogger.log("No price or delay provided, skipping swap");
            const responseMsg = {
                text: "I need the price or delay to perform the swap",
            };
            callback?.(responseMsg);
            return true;
        }

        if (response.delay){
            response.startAt = new Date(Date.now() + parseInt(response.delay));
        }
        response.expireAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day
        response.startAt = response.startAt || new Date();

        if (!response.amount) {
            elizaLogger.log("Amount is not a number, skipping swap");
            const responseMsg = {
                text: "The amount must be a number",
            };
            callback?.(responseMsg);
            return true;
        }
        try {

            const content: Content = {
                ...message.content,
                task: response,
            }
            const memory: Memory = {
                id: stringToUuid(md5sum(JSON.stringify(content))),
                agentId: runtime.agentId,
                content: content,
                roomId: stringToUuid('AUTO_TOKEN_SWAP_TASK'),
                userId: message.userId,
            }
            await runtime.databaseAdapter.createMemory(memory, 'AUTO_TOKEN_SWAP_TASK', true);
            elizaLogger.info(`AUTO_TOKEN_SWAP Task Created, ${JSON.stringify(response)}`);
            const trigger = response.price ? `at price ${response.price}` : response.startAt ? `since ${response.startAt}` : '';
            const responseMsg = {
                text: `AUTO_TOKEN_SWAP Task Created, ${trigger}, SWAP ${response.amount} ${response.inputTokenSymbol} for ${response.outputTokenSymbol}`,
            };

            callback?.(responseMsg);

            return true;
        } catch (error) {
            elizaLogger.error(`Error during token swap:, ${error}`);
            const responseMsg = {
                text: `Error during token swap:, ${error}`,
            };

            callback?.(responseMsg);
            return true;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: 'create auto task, swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM after 5 minutes',
                    inputTokenSymbol: "SOL",
                    outputTokenSymbol: "USDC",
                    amount: 0.1,
                    delay: "300s",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "AUTO_TOKEN_SWAP Task Created, 0.1 SOL for ELIZA at 2025-12-31 23:59:59",
                    action: "AUTO_TOKEN_SWAP",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: 'create auto task, swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price under 0.0.016543',
                    inputTokenSymbol: "SOL",
                    outputTokenSymbol: "USDC",
                    amount: 0.1,
                    price: "0.016543",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "AUTO_TOKEN_SWAP Task Created, 0.1 SOL for ELIZA when price under 0.0.016543",
                    action: "AUTO_TOKEN_SWAP",
                },
            },
        ],
        // Add more examples as needed
    ] as ActionExample[][],
} as Action;