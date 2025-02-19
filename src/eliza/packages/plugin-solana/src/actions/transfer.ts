import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction, ACCOUNT_SIZE,
} from '@solana/spl-token';
import { elizaLogger } from "@elizaos/core";
import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  type ActionExample,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelClass,
  type State,
  type Action,
} from "@elizaos/core";
import { composeContext } from "@elizaos/core";
import { getWalletKey } from "../keypairUtils.js";
import { generateObjectDeprecated } from "@elizaos/core";
import { getWalletTokenBySymbol, isAgentAdmin, NotAgentAdminMessage } from '../providers/walletUtils.js';
import { convertNullStrings } from './swapUtils.js';
import { getRuntimeKey } from '../environment.js';
import { SolanaClient } from './solana-client.js';

export interface TransferContent extends Content {
  tokenAddress: string | null;
  tokenSymbol: string | null;
  recipient: string;
  amount: number | null;
}

const transferTemplate = `
You are an expert on solana token transfers.
Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

# Example response:
\`\`\`json
{
    "tokenSymbol":  "ELIZA",
    "tokenAddress": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "recipient": "FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a",
    "amount": 1000
}
\`\`\`

{{recentMessages}}

# Task
Extract the latest token transfer request from the recent conversation history.

Focus on the most recent message that mentions a token transfer. Ignore transactions that have already been confirmed as “successfully sent.”

Extract the following information:
•Token symbol
•Token contract address (44 characters long, if available)
•Recipient wallet address (44 characters long)
•Amount to transfer (Convert values like 1M to 1000000, 5.1K to 5100, 0.154 to 0.154, etc.)

# Requirements:
•Only extract the latest unconfirmed transfer request. If multiple transfers are mentioned, choose the most recent one.
•Exclude any transfer requests that are followed by a confirmation message (e.g., “Successfully sent”).
•If the token contract address is not explicitly mentioned, leave it blank.
•Use the most recent mention of the amount, token symbol, and recipient address.

If no token address is mentioned, respond with null.
## Response Example:
Given the following example transfer request:
"Transfer 0.27 SOL So11111111111111111111111111111111111111111 to EwH7gvicP4BjURMjpKPNf5hCGbjQg3RxVK2HCgkTuGRc"

The extracted result should be:
{
  "tokenSymbol": "SOL",
  "tokenAddress": "So11111111111111111111111111111111111111111",
  "recipient": "EwH7gvicP4BjURMjpKPNf5hCGbjQg3RxVK2HCgkTuGRc",
  "amount": 0.27
}

## Conversation Example:
Given the following conversation:
- User: send 1 ELIZA to FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a  
- Bot: Failed to send 1 ELIZA to FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a.  
- User: send 1 ai16z to FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a  
- Bot: Successfully sent 1 ai16z to FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a.  
- User: send 0.000001 SOL to FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a  
The extracted result should be:
- Token symbol: SOL  
- Token contract address: (leave blank)  
- Recipient wallet address: FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a
- Amount to transfer: 0.000001  
Ensure that the extraction is precise and accurate, focusing on the latest unfinished transfer request.
`;

const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user’s response to the transfer confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
Consider the latest messages from the conversation history above. Determine the user's response status regarding the confirmation.
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

Decision Criteria:
•"confirmed" → The user has explicitly confirmed the transfer using words like “yes”, “confirm”, “okay”, “sure”, etc.
•"rejected" → The user has responded with anything other than a confirmation.
•"pending" → The user has provided a complete transfer request, but User2 has not yet sent the confirmation prompt.

Additional Rules:
•If the user issues a new transfer instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•Analyze the last five messages to understand the user’s intent in context.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Transfer 0.0001 SOL to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Transfer 1 ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

❓ **Should return \`"pending"\`**  
- User1: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7"  

- User1: "withdraw"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;



export const transfer: Action =  {
  name: "SEND_TOKEN",
  suppressInitialMessage: true,
  similes: ["TRANSFER_TOKEN", "TRANSFER", "WITHDRAW_TOKEN", "WITHDRAW"],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return await isAgentAdmin(runtime, message);
  },
  description: "Transfer SPL tokens or SOL from agent's wallet to another address, aka [send |withdraw|transfer] [amount] [tokenSymbol] [tokenCA] to [address] ",
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
      return null;
    }
    elizaLogger.log("Starting SEND_TOKEN handler...");

    const transferContext = composeContext({
      state,
      template: transferTemplate,
    });

    let content = await generateObjectDeprecated({
      runtime,
      context: transferContext,
      modelClass: ModelClass.LARGE,
    });

    content = convertNullStrings(content) as TransferContent;
    elizaLogger.log(`Transfer Context ${transferContext} Generated Response: ${JSON.stringify(content)}`);

    if (!content.amount || isNaN(content.amount as number)){
      callback({
        text: `Please provide the amount of tokens to transfer`,
      });
      return true;
    }

    if (!content.recipient){
      callback({
        text: `Please provide the address to transfer the tokens to`,
      });
      return true;
    }

    if (!content.tokenAddress && content.tokenSymbol?.toUpperCase() === 'SOL'){
      content.tokenAddress = getRuntimeKey(runtime, 'SOL_ADDRESS');
    }

    const { keypair: senderKeypair } = await getWalletKey(runtime, true);


    if (!content.tokenAddress) {
      const walletToken = await getWalletTokenBySymbol(runtime, senderKeypair.publicKey.toBase58(), content.tokenSymbol);
      content.tokenAddress = walletToken?.address;
      if (!content.tokenAddress) {
        callback({
          text: `Please provide the token CA to transfer`,
        });
        return false;
      }
    }

    const confirmContext = composeContext({
      state,
      template: userConfirmTemplate,
    });

    const confirmResponse = await generateObjectDeprecated({
      runtime,
      context: confirmContext,
      modelClass: ModelClass.LARGE,
    });
    elizaLogger.info(`User confirm check: ${JSON.stringify(confirmResponse)}`);

    if (confirmResponse.userAcked == 'rejected') {
      const responseMsg = {
        text: 'ok. I will not execute this transaction.',
      };
      callback?.(responseMsg);
      return null;
    }

    if (confirmResponse.userAcked == 'pending') {
      const transferInfo = formatTransferInfo(content);
      const responseMsg = {
        text: `${transferInfo}
✅ Please confirm the withdraw by replying with 'yes' or 'ok'.If I’m wrong, feel free to correct me directly.`,
      };
      callback?.(responseMsg);
      return null;
    }

    try {
      elizaLogger.log(`${senderKeypair.publicKey.toBase58()} start transfer content:`, content);

      const connection = new Connection(getRuntimeKey(runtime, 'SOLANA_RPC_URL'), 'confirmed');
      const mintPubkey = new PublicKey(content.tokenAddress);
      const recipientPubkey = new PublicKey(content.recipient);

      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      const mintDecimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals;
      const mintAmount = BigInt(Number(content.amount) * Math.pow(10, mintDecimals));

      const solBalance = await connection.getBalance(senderKeypair.publicKey);
      let solTransferOut = content.tokenAddress === getRuntimeKey(runtime, 'SOL_ADDRESS') ? Number(mintAmount) : 0;
      const programId = await new SolanaClient(getRuntimeKey(runtime, 'SOLANA_RPC_URL'), senderKeypair).getTokenProgramId(content.tokenAddress);

      let transaction = new Transaction();
      if (content.tokenAddress === getRuntimeKey(runtime, 'SOL_ADDRESS')) {
        if (solBalance < solTransferOut) {
          callback({
            text: `Insufficient sol balance. Sender has ${solBalance / LAMPORTS_PER_SOL} SOL, but tx needs ${(solTransferOut) / LAMPORTS_PER_SOL} SOL to complete the transfer.`,
          });
          return;
        }
        transaction.add(SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: recipientPubkey,
          lamports: mintAmount,
        }));
      }else{
        const senderATA = getAssociatedTokenAddressSync(mintPubkey, senderKeypair.publicKey, true, programId);
        const recipientATA = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, false, programId);
        const recipientATAInfo = await connection.getAccountInfo(recipientATA);
        const rentExemptAmount = recipientATAInfo ? 0 : await connection.getMinimumBalanceForRentExemption(165);
        solTransferOut += rentExemptAmount;
        if (solBalance < solTransferOut) {
          callback({
            text: `Insufficient sol balance. Sender has ${solBalance / LAMPORTS_PER_SOL} SOL, but tx needs ${ solTransferOut / LAMPORTS_PER_SOL} SOL to complete the transfer.`,
          });
          return;
        }
        const senderTokenBalance = await connection.getTokenAccountBalance(senderATA);
        if (BigInt(senderTokenBalance.value.amount) < BigInt(mintAmount.toString())) {
          callback({
            text: `Insufficient token balance. Sender has ${senderTokenBalance.value.uiAmount} ${content.tokenSymbol}, but needs ${content.amount} to complete the transfer.`,
          });
          return;
        }
        const instructions = [];
        if (!recipientATAInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              senderKeypair.publicKey,
              recipientATA,
              recipientPubkey,
              mintPubkey,
              programId,
            )
          );
        }

        instructions.push(
          createTransferInstruction(
            senderATA,
            recipientATA,
            senderKeypair.publicKey,
            mintAmount,
            [],
            programId,
          )
        );
        transaction.add(...instructions);
      }
      const recentBlockhash = await connection.getLatestBlockhash('confirmed');
      transaction.feePayer = senderKeypair.publicKey;
      transaction.recentBlockhash = recentBlockhash.blockhash;
      const estimatedFee = await transaction.getEstimatedFee(connection);
      const rentExemption = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
      if (solBalance < (solTransferOut + estimatedFee + rentExemption)) {
        callback({
          text: `Insufficient sol balance. Sender has ${solBalance / LAMPORTS_PER_SOL} SOL, but tx needs ${(estimatedFee + solTransferOut + rentExemption) / LAMPORTS_PER_SOL} SOL to complete the transfer.`,
        });
        return;
      }
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [senderKeypair],
        {
          commitment: 'confirmed',
          maxRetries: 10,
          preflightCommitment: 'confirmed',
        },
      );

      if (callback) {
        callback({
          text: `Successfully sent ${content.amount} ${content.tokenSymbol || content.tokenAddress} to ${content.recipient}.\n\nTransaction hash: ${signature}`,
          content: {
            success: true,
            signature,
            amount: content.amount,
            recipient: content.recipient,
          },
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("Error during token transfer:", error);
      if (callback) {
        callback({
          text: `Issue with the transfer: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Send 69 EZSIS BieefG47jAHCGZBxi2q87RDuHyGZyYC3vAzxpyu8pump to 9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Sending the tokens now...",
          action: "SEND_TOKEN",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;


function formatTransferInfo(content: TransferContent): string {
  return `
💱 Withdraw Request:
----------------------------
🔹 Withdraw: ${content.amount} ${content.tokenSymbol || content.tokenAddress} 
🔸 To: ${content.recipient}  
----------------------------
  `;
}