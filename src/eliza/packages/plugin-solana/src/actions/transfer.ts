import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  ACCOUNT_SIZE,
} from '@solana/spl-token';
import { elizaLogger } from '@elizaos/core';
import {
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
} from '@elizaos/core';
import { composeContext } from '@elizaos/core';
import { getWalletKey } from '../keypairUtils.js';
import { generateObjectDeprecated } from '@elizaos/core';
import {
  getWalletTokenBySymbol,
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import { convertNullStrings } from '../providers/swapUtils.js';
import { getRuntimeKey } from '../environment.js';
import {
  SolanaClient,
  STANDARD_SOL_ADDRESS,
} from '../providers/solanaClient.js';
import { BigNumber } from 'bignumber.js';

export interface TransferContent extends Content {
  tokenAddress: string | null;
  tokenSymbol: string | null;
  recipient: string;
  amount: number | null;
}

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

export const transfer: Action = {
  name: 'SEND_TOKEN',
  suppressInitialMessage: true,
  functionCallSpec: {
    name: 'SEND_TOKEN',
    strict: true,
    additionalProperties: false,
    description:
      'Transfer SPL tokens or SOL from agent wallet to another address',
    parameters: {
      type: 'object',
      properties: {
        tokenSymbol: {
          type: ['string', 'null'],
          description:
            'The token symbol to transfer, at lease one of tokenSymbol or tokenAddress is provided',
        },
        tokenAddress: {
          type: ['string', 'null'],
          description:
            'The token contract address to transfer, at lease one of tokenSymbol or tokenAddress is provided',
        },
        recipient: {
          type: 'string',
          description: 'The recipient wallet address',
        },
        amount: {
          type: 'string',
          description: 'The number amount of tokens to transfer',
        },
      },
      required: ['tokenSymbol', 'tokenAddress', 'recipient', 'amount'],
    },
  },
  similes: ['TRANSFER_TOKEN', 'TRANSFER', 'WITHDRAW_TOKEN', 'WITHDRAW'],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description:
    "Transfer SPL tokens or SOL from agent's wallet to another address, aka [send |withdraw|transfer] [amount] [tokenSymbol] [tokenCA] to [address] ",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<boolean> => {
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      callback?.(NotAgentAdminResponse);
      return false;
    }
    const content = convertNullStrings(
      state.actionParameters,
    ) as TransferContent;

    if (!content.amount || isNaN(content.amount as number)) {
      callback({
        text: `Please provide the amount of tokens to transfer`,
      });
      return true;
    }

    if (!content.recipient) {
      callback({
        text: `Please provide the address to transfer the tokens to`,
      });
      return true;
    }

    if (!content.tokenAddress && content.tokenSymbol?.toUpperCase() === 'SOL') {
      content.tokenAddress = STANDARD_SOL_ADDRESS;
    }

    const { keypair: senderKeypair } = await getWalletKey(runtime, true);

    if (!content.tokenAddress) {
      const walletToken = await getWalletTokenBySymbol(
        runtime,
        senderKeypair.publicKey.toBase58(),
        content.tokenSymbol,
      );
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

    const solanaClient = new SolanaClient(
      getRuntimeKey(runtime, 'SOLANA_RPC_URL'),
      senderKeypair.publicKey,
    );
    if (confirmResponse.userAcked == 'pending') {
      const balance = await solanaClient.getUIBalance(content.tokenAddress);
      const transferPercentage = (
        (Number(content.amount) / balance) *
        100
      ).toFixed(1);
      const transferInfo = formatTransferInfo(
        senderKeypair.publicKey.toBase58(),
        {
          ...content,
          transferPercentage,
        },
      );
      const responseMsg = {
        text: `${transferInfo}`,
      };
      callback?.(responseMsg);
      return null;
    }

    try {
      elizaLogger.log(
        `${senderKeypair.publicKey.toBase58()} start transfer content:`,
        content,
      );

      const connection = new Connection(
        getRuntimeKey(runtime, 'SOLANA_RPC_URL'),
        'confirmed',
      );
      const mintPubkey = new PublicKey(content.tokenAddress);
      const recipientPubkey = new PublicKey(content.recipient);

      const mintDecimals = await solanaClient.getMintDecimals(
        content.tokenAddress,
      );
      if (!mintDecimals || isNaN(mintDecimals)) {
        callback({
          text: `Token ${content.tokenAddress} not found. Please provide a valid token address.`,
        });
        return false;
      }
      const mintAmount = BigInt(
        new BigNumber(content.amount)
          .multipliedBy(new BigNumber(10).pow(mintDecimals))
          .toFixed(0),
      );

      const solBalance = await connection.getBalance(senderKeypair.publicKey);
      let solTransferOut =
        content.tokenAddress === STANDARD_SOL_ADDRESS ? Number(mintAmount) : 0;

      const transaction = new Transaction();
      if (content.tokenAddress === STANDARD_SOL_ADDRESS) {
        if (solBalance < solTransferOut) {
          callback({
            text: `Insufficient sol balance. Sender has ${solBalance / LAMPORTS_PER_SOL} SOL, but tx needs ${solTransferOut / LAMPORTS_PER_SOL} SOL to complete the transfer.`,
          });
          return;
        }
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports: mintAmount,
          }),
        );
      } else {
        const programId = await solanaClient.getTokenProgramId(
          content.tokenAddress,
        );
        const senderATA = getAssociatedTokenAddressSync(
          mintPubkey,
          senderKeypair.publicKey,
          true,
          programId,
        );
        const recipientATA = getAssociatedTokenAddressSync(
          mintPubkey,
          recipientPubkey,
          false,
          programId,
        );
        const recipientATAInfo = await connection.getAccountInfo(recipientATA);
        const rentExemptAmount = recipientATAInfo
          ? 0
          : await connection.getMinimumBalanceForRentExemption(165);
        solTransferOut += rentExemptAmount;
        if (solBalance < solTransferOut) {
          callback({
            text: `Insufficient sol balance. Sender has ${solBalance / LAMPORTS_PER_SOL} SOL, but tx needs ${solTransferOut / LAMPORTS_PER_SOL} SOL to complete the transfer.`,
          });
          return;
        }
        const senderTokenBalance =
          await connection.getTokenAccountBalance(senderATA);
        if (
          BigInt(senderTokenBalance.value.amount) <
          BigInt(mintAmount.toString())
        ) {
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
            ),
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
          ),
        );
        transaction.add(...instructions);
      }
      const recentBlockhash = await connection.getLatestBlockhash('confirmed');
      transaction.feePayer = senderKeypair.publicKey;
      transaction.recentBlockhash = recentBlockhash.blockhash;
      const estimatedFee = await transaction.getEstimatedFee(connection);
      const rentExemption =
        await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
      if (solBalance < solTransferOut + estimatedFee + rentExemption) {
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
      elizaLogger.error('Error during token transfer:', error);
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
        user: '{{user1}}',
        content: {
          text: 'Send 69 EZSIS BieefG47jAHCGZBxi2q87RDuHyGZyYC3vAzxpyu8pump to 9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Sending the tokens now...',
          action: 'SEND_TOKEN',
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

function formatTransferInfo(from: string, content): string {
  return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
➡️ Type: Transfer
🪙 Token: ${content.tokenSymbol} (${content.tokenAddress})
💰 Amount: ${content.amount} (${content.transferPercentage}%)
💼 From: ${from}
💼 To: ${content.recipient}
————
Reply 'ok' or 'yes' to confirm.`;
}
