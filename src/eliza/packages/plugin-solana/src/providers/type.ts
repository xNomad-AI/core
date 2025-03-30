import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { BigNumber } from 'bignumber.js';

export type SwapTransaction = VersionedTransaction | Transaction;

export interface SwapTokenDto {
  connection: Connection;
  keyPair: Keypair;
  userWalletAddress: string;
  inputTokenCA: string;
  outputTokenCA: string;
  amount: string | BigNumber;
  slippage: number; // 0.01 = 1%
  priorityFee: number;
  tip?: number; // default 0.001 SOL
  mode?: 'FAST' | 'ANTI_MEV';
}

export interface JitoResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
}

export interface OkxSwapResponse {
  data: {
    data: Array<{
      tx: {
        data: string;
      };
    }>;
    msg?: string;
  };
}

export interface OkxParams {
  amount: string;
  slippage: string;
  chainId: string;
  userWalletAddress: string;
  computeUnitPrice: string;
  computeUnitLimit: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  feePercent?: string; // 0~3
  fromTokenReferrerWalletAddress?: string; // buy
  toTokenReferrerWalletAddress?: string; // sell
  directRoute?: boolean;
  autoSlippage?: boolean;
  maxAutoSlippage?: string;

}

export const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user's response to the tx confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
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
•Analyze the last five messages to understand the user's intent in context.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Transfer 0.0001 SOL to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "SWAP 1 ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM to SOL. Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7. Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

❓ **Should return \`"pending"\`**  
- User1: "Transfer 1 ai16z to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7"  

- User1: "withdraw 1 ELIZA 5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM to 3CpQxMsS846eB8Dxee488fLwx5Xbnd45sA2dNuphYWV7"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;
