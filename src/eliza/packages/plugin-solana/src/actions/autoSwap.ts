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
import { isValidSPLTokenAddress, swapToken } from './swap.js';
import { getTokensBySymbol } from '../providers/tokenUtils.js';


export const AutoSwapTaskTable = 'AUTO_TOKEN_SWAP_TASK';
export interface AutoSwapTask {
    inputTokenSymbol: string | null;
    outputTokenSymbol: string | null;
    inputTokenCA: string | null;
    outputTokenCA: string | null;
    amount: number | string | null;
    delay: string | null;
    startAt: Date | null;
    expireAt: Date;
    priceConditon: 'under' | 'over';
    priceTarget: number | string | null;
}

const autoSwapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use \`null\` for any values that cannot be determined.

Example response:
\`\`\`json
{
    "inputTokenSymbol": "SOL",
    "outputTokenSymbol": "ELIZA",
    "inputTokenCA": "So11111111111111111111111111111111111111112",
    "outputTokenCA": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "amount": 0.1,
    "delay": "300s",
    "priceConditon": "under",
    "priceTarget": 0.016543
}

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token swap:
Input token symbol (the token being sold)
Output token symbol (the token being bought)
Input token contract address (if provided)
Output token contract address (if provided)
Amount to swap (number or string)
Delay (if provided, e.g., “after 5 minutes” → "300s")
Price trigger condition ("under" or "over")
Price target (if provided)

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "inputTokenSymbol": string | null,
    "outputTokenSymbol": string | null,
    "inputTokenCA": string | null,
    "outputTokenCA": string | null,
    "amount": number | string | null,
    "delay": string | null,
    "priceConditon": "under" | "over" | null,
    "priceTarget": number | null
}
\`\`\``;


const userConfirmAutoTaskTemplate = `
{{recentMessages}}

Determine whether the user has explicitly confirmed to create an autotask.  
Consider only the last three messages from the conversation history above.
Respond with a json 
{
    "userAcked": boolean
}
userAcked value: \`true\` if the user has confirmed, otherwise \`false\`.  

**Confirmation Criteria:**  
- The user must clearly express intent using words such as **"yes"** or **"confirm"**.  
- Responses like **"okay" (ok), "sure"**, or similar should also be considered confirmation.  
- Any ambiguous, uncertain, or unrelated responses should result in \`false\`.  
- If the user does not respond at all after the confirmation request, return \`false\`.  

**Examples:**  

 **Should return \`true\`**  
- User1: "create autotask swap 0.0001 SOL for USDC when price under 0.99"  
- User2: "Auto Task:: Swap 0.00001 SOL for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v when price under 0.99. \n Please confirm the swap by replying with 'yes' or 'confirm'.;
- User1: "yes"  

- User1: "i want to buy 0.1 SOL ELIZA when price under 0.016543"  
- User2: "Please provide the CA of ELIZA"
- User1: "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM"
- User2: "Auto Task:: Swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM when price under 0.016543. \n Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "okay"  

 **Should return \`false\`**  
- User1: "swap 0.0001 SOL for USDC when price under 0.99"  
- User2: "Auto Task: Swap 0.00001 SOL for USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v when price under 0.99. \n Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: "hmm..."  

- User1: "buy 0.1 SOL ELIZA when price under 0.016543"  
- User2: "Auto Task:: Swap 0.1 SOL for ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM.when price under 0.016543 \n Please confirm the swap by replying with 'yes' or 'confirm'."  
- User1: (no response)  

{
    "userAcked": boolean | null
}
Return the json with userAcked field value \`true\` or \`false\` based on the **immediate** response following the confirmation request.`;


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
    const { id } = memory;
    let content: Content;
    // check content type
    if (typeof content === 'string'){
        content = JSON.parse(content);
    } else {
        content = memory.content;
    }
    // do not remove!
    if (typeof content === 'string'){
        content = JSON.parse(content);
    } else {
        content = memory.content;
    }

    const task = (content.task) as AutoSwapTask;
    elizaLogger.info("executeAutoTokenSwapTask", content, id);

    if (task.startAt && task.startAt > new Date()) {
        elizaLogger.info("Task is not ready to start yet");
        return;
    }

    if (task.expireAt && task.expireAt <= new Date()) {
        elizaLogger.info(`Task has expired ${id}`);
        await runtime.databaseAdapter.removeMemory(id, 'AUTO_TOKEN_SWAP_TASK');
    }

    if (task.priceTarget){
        const tokenCA = task.priceConditon === 'under'? task.outputTokenCA : task.inputTokenCA;
        const tokenPrice = await getSwapTokenPrice(runtime, tokenCA);
        const tokenPriceMatched = task.priceConditon === 'under' ? (tokenPrice && tokenPrice < Number(task.priceTarget)) : (tokenPrice && tokenPrice > Number(task.priceTarget));
        if (!tokenPriceMatched) {
            elizaLogger.info(`Token price not matched ${id}, price: ${tokenPrice}, expected: ${task.priceTarget}`);
            return;
        }
    }

    await runtime.databaseAdapter.removeMemory(id, AutoSwapTaskTable);
    const {keypair} = await getWalletKey(runtime, true);
    const txId = await executeSwapTokenTx(runtime, keypair, task.inputTokenCA, task.outputTokenCA, Number(task.amount));
    elizaLogger.info(`AUTO_TOKEN_SWAP_TASK Finished successfully ${id}, txId: ${txId}`);
}

export const autoTask: Action = {
    name: "AUTO_TASK",
    similes: ["AUTO_BUY_TOKEN", "AUTO_SELL_TOKEN", "AUTO_SWAP_TOKENS", "AUTO_TOKEN_SWAP", "AUTO_TRADE_TOKENS", "AUTO_EXCHANGE_TOKENS"],
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
        const task = await checkResponse(runtime, message, state, _options, callback);
        if (!task) {
            return true;
        }
        try {
            const content: Content = {
                ...message.content,
                task: task,
            }
            const memory: Memory = {
                id: stringToUuid(md5sum(JSON.stringify(content))),
                agentId: runtime.agentId,
                content: content,
                roomId: stringToUuid(AutoSwapTaskTable),
                userId: message.userId,
            }
            await runtime.databaseAdapter.createMemory(memory, AutoSwapTaskTable, true);
            elizaLogger.info(`AUTO_TOKEN_SWAP Task Created, ${JSON.stringify(task)}`);
            const responseMsg = {
                text: `Auto Task Created Successfully`,
            };
            callback?.(responseMsg);
            return true;
        } catch (error) {
            elizaLogger.error(`Error during autotask create:, ${error}`);
            const responseMsg = {
                text: `Emm... something went wrong, please try again later`,
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
                    text: "buy USDC with 0.0001 SOL when price under 0.99",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Please provide the CA of USDC",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    action: "AUTO_TOKEN_SWAP",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Please confirm the swap by replying with 'yes' or 'confirm'.",
                }
            },
            {
                user: "{{user1}}",
                content: {
                    text: "yes",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "AUTO_TOKEN_SWAP Task Created",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    inputTokenSymbol: "SOL",
                    inputTokenCA: "So11111111111111111111111111111111111111112",
                    outputTokenSymbol: "USDC",
                    outputTokenCA: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    amount: 0.1,
                    priceConditon: "under",
                    priceTarget: 0.99,
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "yes",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "AUTO Task Created",
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


async function checkResponse(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback
): Promise<{
    inputTokenCA: string;
    outputTokenCA: string;
    amount: number;
} | null> {
    // check if the swap request is from agent owner or public chat
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
        const responseMsg = {
            text: NotAgentAdminMessage,
        };
        callback?.(responseMsg);
        return null
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

    // generate formatted response from chat
    const response = await generateObjectDeprecated({
        runtime,
        context: swapContext,
        modelClass: ModelClass.LARGE,
    });

    elizaLogger.info(`Message: ${message?.content?.text}, Response:`, response);

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
            return null
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
            return null
        }
    }

    // check if amount is a number
    if (!response.amount || Number.isNaN(Number(response.amount))){
        const responseMsg = {
            text: 'Please provide a valid input amount to perform the swap',
            action: 'EXECUTE_SWAP',
        };
        callback?.(responseMsg);
        return null;
    }

    let validInputTokenCA = isValidSPLTokenAddress(response.inputTokenCA);
    let validOutputTokenCA = isValidSPLTokenAddress(response.outputTokenCA);
    const validInputTokenSymbol = isValidSPLTokenAddress(response.inputTokenSymbol);
    const validOutputTokenSymbol = isValidSPLTokenAddress(response.outputTokenSymbol);

    // the CA maybe recognized as symbol, so we need to check if it is a valid CA
    if (validInputTokenSymbol && !validInputTokenCA) {
        response.inputTokenCA = response.inputTokenSymbol;
    }
    if (validOutputTokenSymbol && !validOutputTokenCA) {
        response.outputTokenCA = response.outputTokenSymbol;
    }

    validInputTokenCA = isValidSPLTokenAddress(response.inputTokenCA);
    validOutputTokenCA = isValidSPLTokenAddress(response.outputTokenCA);
    if (!validInputTokenCA){
        const tokens = await getTokensBySymbol(runtime.getSetting("BIRDEYE_API_KEY"), response.inputTokenSymbol);
        if (tokens?.[0]?.address) {
            response.inputTokenCA = tokens[0].address;
        }else{
            elizaLogger.log("Invalid input contract address, skipping swap");
            const responseMsg = {
                text: "Please provide the inputToken CA you want to sell",
            };
            callback?.(responseMsg);
            return null;
        }
    }

    if (!validOutputTokenCA) {
        const tokens = await getTokensBySymbol(runtime.getSetting("BIRDEYE_API_KEY"), response.outputTokenSymbol);
        if (tokens?.[0]?.address) {
            response.outputTokenCA = tokens[0].address;
        }else{
            elizaLogger.log("Invalid output contract address, skipping swap");
            const responseMsg = {
                text: "Please provide the outputToken CA you want to buy",
            };
            callback?.(responseMsg);
            return null;
        }
    }

    if (!response.price && !response.delay) {
        const responseMsg = {
            text: "Please tell me at what price you want to swap, or provide a time delay, for example after 5 minutes",
        };
        callback?.(responseMsg);
        return null;
    }

    if (response.delay){
        response.startAt = new Date(Date.now() + parseInt(response.delay));
    }else{
        response.startAt = new Date();
    }

    response.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);


    elizaLogger.info(`checking if user confirm to create task`);

    const confirmContext = composeContext({
        state,
        template: userConfirmAutoTaskTemplate,
    });

    const confirmResponse = await generateObjectDeprecated({
        runtime,
        context: confirmContext,
        modelClass: ModelClass.LARGE,
    });
    elizaLogger.info(`User confirm check: ${JSON.stringify(confirmResponse)}`);

    if (confirmResponse.userAcked != "true" && confirmResponse.userAcked != true) {
        const swapInfo = formatTaskInfo(response);
        const responseMsg = {
            text: `
                ${swapInfo}
✅ Please confirm the swap by replying with 'yes' or 'ok'.
                `,
            action: 'EXECUTE_SWAP',
        };
        callback?.(responseMsg);
        return null
    }

    return response;
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

function formatTaskInfo(params: AutoSwapTask): string {
    let trigger = ""
    if (params.priceConditon) {
        trigger = `when price is ${params.priceConditon} ${params.priceTarget}`;
    }
    if (params.startAt) {
        trigger += `\nstart at: ${JSON.stringify(params.startAt)}`;
    }
    trigger += `\nexpire at: ${JSON.stringify(params.expireAt)}`

    return `
💱 Auto Task:
----------------------------
🔹 From: ${params.amount} ${params.inputTokenSymbol}  
   📌 CA: ${params.inputTokenCA}

🔸 To: ${params.outputTokenSymbol}  
   📌 CA: ${params.outputTokenCA}
   
   Condition: ${trigger}
----------------------------
  `;
}