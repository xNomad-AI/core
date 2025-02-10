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
import { Connection, Keypair, RpcResponseAndContext, SignatureStatus, VersionedTransaction } from '@solana/web3.js';
import { getWalletKey } from "../keypairUtils.js";
import { isAgentAdmin, NotAgentAdminMessage, walletProvider, WalletProvider } from '../providers/wallet.js';
import {md5sum} from "./swapUtils.js";
import {swapToken} from "./swap.js";


export const AutoSwapTaskTable = 'AUTO_TOKEN_SWAP_TASK';
export interface AutoSwapTask {
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
- Delay if provided (for example after 5 minutes, tomorrow)
- Price if provided (for example when price under 0.0.016543)

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

export async function executeAutoTokenSwapTask(runtime: IAgentRuntime, memory: Memory){
    const {content, id} = memory;
    const task = content.task as AutoSwapTask;
    elizaLogger.info("executeAutoTokenSwapTask", task, id);

    if (task.startAt && task.startAt > new Date()) {
        elizaLogger.info("Task is not ready to start yet");
        return;
    }

    if (task.expireAt && task.expireAt <= new Date()) {
        elizaLogger.info(`Task has expired ${id}`);
        await runtime.databaseAdapter.removeMemory(id, 'AUTO_TOKEN_SWAP_TASK');
    }

    if (task.price){
        const tokenCA = task.inputTokenCA === settings.SOL_ADDRESS? task.outputTokenCA : task.inputTokenCA;
        const tokenPrice = await getSwapTokenPrice(runtime, tokenCA);
        const tokenPriceMatched = task.inputTokenCA === settings.SOL_ADDRESS ? (tokenPrice && tokenPrice <= task.price) : (tokenPrice && tokenPrice >= task.price);
        if (!tokenPriceMatched) {
            elizaLogger.info(`Token price not matched ${id}, price: ${tokenPrice}, expected: ${task.price}`);
            return;
        }
    }

    await runtime.databaseAdapter.removeMemory(id, 'AUTO_TOKEN_SWAP_TASK');
    const {keypair} = await getWalletKey(runtime, true);
    const txId = await executeSwapTokenTx(runtime, keypair, task.inputTokenCA, task.outputTokenCA, Number(task.amount));
    elizaLogger.info(`AUTO_TOKEN_SWAP_TASK Finished successfully ${id}, txId: ${txId}`);
}

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
        const isAdmin = await isAgentAdmin(runtime, message);
        if (!isAdmin) {
            const responseMsg = {
                text: NotAgentAdminMessage,
            };
            callback?.(responseMsg);
            return true;
        }
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

        if (response.inputTokenCA != settings.SOL_ADDRESS && response.outputTokenCA != settings.SOL_ADDRESS) {
            const responseMsg = {
                text: "I'm sorry, I can only swap SOL for other tokens at the moment",
            };
            callback?.(responseMsg);
            return true;
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
                    text: 'create auto task, swap 0.0001 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price under 0.016543',
                    inputTokenSymbol: "SOL",
                    outputTokenSymbol: "USDC",
                    amount: 0.0001,
                    price: "0.016543",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "AUTO_TOKEN_SWAP Task Created, 0.0001 SOL for ELIZA when price under 0.016543",
                    action: "AUTO_TOKEN_SWAP",
                },
            },
        ],
        // Add more examples as needed
    ] as ActionExample[][],
} as Action;


async function getSwapTokenPrice(runtime: IAgentRuntime, tokenCA): Promise<number | undefined> {
    try {
        const birdeyeApiKey = runtime.getSetting("BIRDEYE_API_KEY") || process.env.BIRDEYE_API_KEY;
        const url = `https://public-api.birdeye.so/defi/price?address=${tokenCA}`;
        const response = await fetch(url, {
            headers: {
                "X-API-KEY": birdeyeApiKey,
                "accept": "application/json",
                "x-chain": "solana",
            },
        });
        const result = await response.json();
        return result?.data.value;
    }catch (error){
        elizaLogger.error(`Error fetching token price: ${error}`);
        return undefined;
    }
}


async function executeSwapTokenTx(runtime: IAgentRuntime, keypair: Keypair, inputTokenCA: string, outputTokenCA: string, amount: number){
    elizaLogger.info(`swapToken ${keypair.publicKey.toBase58()} : ${inputTokenCA} for ${outputTokenCA} amount: ${amount}`);
    const connection = new Connection(
      runtime.getSetting("SOLANA_RPC_URL") || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    );
    const swapResult = await swapToken(
      connection,
      keypair.publicKey,
      inputTokenCA as string,
      outputTokenCA as string,
      amount as number,
      runtime,
    );

    elizaLogger.info("Deserializing transaction...");
    const transactionBuf = Buffer.from(
      swapResult.swapTransaction,
      "base64"
    );
    const transaction =
      VersionedTransaction.deserialize(transactionBuf);

    elizaLogger.log("Signing transaction...");
    transaction.sign([keypair]);
    elizaLogger.log("Sending transaction...");

    const txid = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
    });

    elizaLogger.log("Transaction sent:", txid);

    let confirmation: RpcResponseAndContext<SignatureStatus | null>;

    // wait for 20s for the transaction to be processed
    for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        confirmation = await connection.getSignatureStatus(txid, {
            searchTransactionHistory: false,
        });

        if (confirmation.value) {
            break;
        }
    }

    elizaLogger.log("Swap completed successfully!");
    elizaLogger.log(`Transaction ID: ${txid}`);
    return txid;
}