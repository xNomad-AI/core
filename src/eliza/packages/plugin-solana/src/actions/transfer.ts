import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
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
import { isAgentAdmin, NotAgentAdminMessage } from '../providers/walletUtils.js';
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

Example response:
\`\`\`json
{
    "tokenSymbol":  "ELIZA",
    "tokenAddress": "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "recipient": "FVg6p4nBWNWgFgJmJHdygWuiQY4g7PyXmzXxcshf128a",
    "amount": 1000
}
\`\`\`

{{recentMessages}}

Extract the latest token transfer request from the recent conversation history.

Focus on the most recent message that mentions a token transfer. Ignore transactions that have already been confirmed as “successfully sent.”

Extract the following information:
•Token symbol
•Token contract address (44 characters long, if available)
•Recipient wallet address (44 characters long)
•Amount to transfer (Convert values like 1M to 1000000, 5.1K to 5100, etc.)

Requirements:
•Only extract the latest unconfirmed transfer request. If multiple transfers are mentioned, choose the most recent one.
•Exclude any transfer requests that are followed by a confirmation message (e.g., “Successfully sent”).
•If the token contract address is not explicitly mentioned, leave it blank.
•Use the most recent mention of the amount, token symbol, and recipient address.

If no token address is mentioned, respond with null.

Example:
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

Determine the user's response status regarding the swap confirmation.  
Consider only the last three messages messages from the conversation history above.  
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

**Decision Criteria:**  
"confirmed" → The user has explicitly confirmed the transfer using words like “yes”, “confirm”, “okay”, “sure”, etc.
"rejected" → The user has responded with anything other than a confirmation.
"pending" → The user has provided a complete transfer request, but User2 has not yet sent the confirmation prompt.

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
// if we get the token symbol but not the CA, check walet for matching token, and if we have, get the CA for it



export const transfer: Action =  {
  name: "SEND_TOKEN",
  suppressInitialMessage: true,
  similes: ["TRANSFER_TOKEN", "WITHDRAW_TOKEN", "WITHDRAW"],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return await isAgentAdmin(runtime, message);
  },
  description: "Transfer SPL tokens or SOL from agent's wallet to another address, aka send or withdraw a certain amount of tokens to a specific address.",
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

    if (!content.amount || isNaN(content.amount as number)){
      callback({
        text: `Please provide the amount of tokens to transfer`,
      });
    }

    if (!content.tokenAddress && content.tokenSymbol?.toUpperCase() === 'SOL'){
      content.tokenAddress = getRuntimeKey(runtime, 'SOL_ADDRESS');
    }

    if (!content.tokenAddress){
      callback({
        text: `Please provide the token CA to transfer`,
      });
      return false;
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
        text: `
                ${transferInfo}
✅ Please confirm the withdraw by replying with 'yes' or 'ok'.
                `,
      };
      callback?.(responseMsg);
      return null;
    }

    try {
      const { keypair: senderKeypair } = await getWalletKey(runtime, true);
      elizaLogger.log(`${senderKeypair.publicKey.toBase58()} start transfer content:`, content);

      const connection = new Connection(getRuntimeKey(runtime, 'SOLANA_RPC_URL'), 'confirmed');
      const mintPubkey = new PublicKey(content.tokenAddress);
      const recipientPubkey = new PublicKey(content.recipient);

      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals;
      const adjustedAmount = BigInt(Number(content.amount) * Math.pow(10, decimals));
      let transaction = new Transaction();
      if (content.tokenAddress === getRuntimeKey(runtime, 'SOL_ADDRESS')) {
        const senderBalance = await connection.getBalance(senderKeypair.publicKey);
        if (senderBalance < adjustedAmount) {
          callback({
            text: `Insufficient balance. Sender has ${senderBalance / LAMPORTS_PER_SOL} SOL, but needs ${adjustedAmount/ BigInt(LAMPORTS_PER_SOL)} SOL to complete the transfer.`,
          });
          return;
        }
        transaction.add(SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: recipientPubkey,
          lamports: adjustedAmount,
        }));
      }else{
        const programId = await new SolanaClient(getRuntimeKey(runtime, 'SOLANA_RPC_URL'), senderKeypair).getTokenProgramId(content.tokenAddress);
        const senderATA = getAssociatedTokenAddressSync(mintPubkey, senderKeypair.publicKey, false, programId);
        const recipientATA = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, false, programId);
        const instructions = [];
        const recipientATAInfo = await connection.getAccountInfo(recipientATA);
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
            adjustedAmount,
            [],
            programId,
          )
        );
        transaction.add(...instructions);
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