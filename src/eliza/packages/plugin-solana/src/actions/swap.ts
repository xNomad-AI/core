import {
  type ActionExample,
  composeContext,
  generateObjectDeprecated,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelClass,
  type State,
  type Action,
  elizaLogger, ActionStatus,
} from '@elizaos/core';
import {
  Connection, LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { getWalletKey } from '../keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import { convertNullStrings, getTradeSettings } from '../providers/swapUtils.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { getSolanaClient, SolanaClient } from '../providers/solanaClient.js';
import {
  getTokenCABySymbol,
  trimTokenSymbol,
  validateAndAssignCA,
} from '../providers/tokenUtils.js';
import { getRuntimeKey } from '../environment.js';
import { SwapTokenService } from '../providers/swapTokenService';
import { BigNumber } from 'bignumber.js';

interface SwapTokenRequest {
  inputTokenSymbol: string;
  inputTokenCA: string;
  outputTokenSymbol: string;
  outputTokenCA: string;
  inputTokenAmount: number | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: number | null;
  pendingConfirmation: boolean | null;
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

**Decision Criteria:**  
"confirmed" → The user has explicitly confirmed the swap using words like “yes”, “confirm”, “okay”, “sure”, etc.
"rejected" → The user has responded with anything other than a confirmation.
"pending" → The user has provided a complete swap request, but User2 has not yet sent the confirmation prompt.

**Additional Rules:**  
•If the user issues a new instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Swap 0.0001 SOL for USDC. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Swap 0.1 SOL for ELIZA. Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Swap 0.0001 SOL for USDC. Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

- User1: "buy 0.1 SOL ELIZA"  
- User2: "Swap 0.1 SOL for ELIZA. Please confirm by replying with 'yes' or 'confirm'."  
- User1: "cancel"  

❓ **Should return \`"pending"\`**  
- User1: "swap 0.0001 SOL for USDC"  

- User1: "buy 0.1 SOL ELIZA"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;

export const executeSwap: Action = {
  functionCallSpec: {
    name: 'EXECUTE_SWAP',
    strict: true,
    additionalProperties: false,
    description:
      "Swap tokens on the Solana blockchain. When the user specifies 'buy <token>', the default input token is SOL. When the user specifies 'sell <token>', the default output token is SOL.",
    parameters: {
      type: 'object',
      properties: {
        inputTokenSymbol: {
          type: ['string', 'null'],
          description:
            "Symbol of the token to sell. Defaults to 'SOL' when buying another token. Either inputTokenSymbol or inputTokenCA must be provided.",
        },
        inputTokenCA: {
          type: ['string', 'null'],
          description:
            'Contract address of the token to sell. Either inputTokenSymbol or inputTokenCA must be provided.',
        },
        outputTokenSymbol: {
          type: ['string', 'null'],
          description:
            "Symbol of the token to buy. Defaults to 'SOL' when selling another token. Either outputTokenSymbol or outputTokenCA must be provided.",
        },
        outputTokenCA: {
          type: ['string', 'null'],
          description:
            'Contract address of the token to buy. Either outputTokenSymbol or outputTokenCA must be provided.',
        },
        inputTokenAmount: {
          type: ['number', 'null'],
          description:
            'Exact amount of the input token to swap. Required if inputTokenPercentage is not provided.',
        },
        inputTokenPercentage: {
          type: ['number', 'null'],
          description:
            'Percentage of the input token balance to swap. Required if inputTokenAmount is not provided. When extracting percentages, convert values like "50%" into decimal form (e.g., 0.5 instead of 50).',
        },
        outputTokenAmount: {
          type: ['number', 'null'],
          description: 'Expected amount of the output token to receive.',
        },
      },
      required: [
        'inputTokenSymbol',
        'outputTokenSymbol',
        'inputTokenCA',
        'outputTokenCA',
        'inputTokenAmount',
        'inputTokenPercentage',
      ],
    },
  },
  name: 'EXECUTE_SWAP',
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description:
    'Perform a token swap. buy or sell tokens, supports SOL and SPL tokens swaps.',
  formatParameters: async (runtime: IAgentRuntime, parameters: any, callback?: HandlerCallback) => {
    elizaLogger.log('parameters (formatParameters): ', parameters);
    const defaultValues: SwapTokenRequest = {
        inputTokenSymbol: null,
        inputTokenCA: null,
        outputTokenSymbol: null,
        outputTokenCA: null,
        inputTokenAmount: null,
        inputTokenPercentage: null,
        outputTokenAmount: null,
        pendingConfirmation: null
    };
    const formattedParameters = {
        ...defaultValues,
        ...convertNullStrings(parameters)
    } as SwapTokenRequest;
    
    formattedParameters.inputTokenAmount = Number(formattedParameters.inputTokenAmount);
    formattedParameters.inputTokenPercentage = Number(formattedParameters.inputTokenPercentage);
    formattedParameters.outputTokenAmount = Number(formattedParameters.outputTokenAmount);

    if (formattedParameters.inputTokenSymbol?.toUpperCase() === 'SOL') {
      formattedParameters.inputTokenCA = getRuntimeKey(runtime, 'SOL_ADDRESS');
    }
    if (formattedParameters.outputTokenSymbol?.toUpperCase() === 'SOL') {
      formattedParameters.outputTokenCA = getRuntimeKey(runtime, 'SOL_ADDRESS');
    }
    formattedParameters.inputTokenCA = validateAndAssignCA(
      formattedParameters.inputTokenSymbol,
      formattedParameters.inputTokenCA,
    );
    formattedParameters.outputTokenCA = validateAndAssignCA(
      formattedParameters.outputTokenSymbol,
      formattedParameters.outputTokenCA,
    );

    if (!formattedParameters.inputTokenCA) {
      formattedParameters.inputTokenCA = await getTokenCABySymbol(
        runtime,
        formattedParameters.inputTokenSymbol,
      );
      if (!formattedParameters.inputTokenCA) {
        const responseMsg = {
          text: 'Please provide a valid inputToken CA you want to sell',
        };
        callback?.(responseMsg);
        return { status: 'incomplete info', parameters: formattedParameters};
      }
    }

    if (!formattedParameters.outputTokenCA) {
      formattedParameters.outputTokenCA = await getTokenCABySymbol(
        runtime,
        formattedParameters.outputTokenSymbol,
      );
      if (!formattedParameters.outputTokenCA) {
        const responseMsg = {
          text: 'Please provide a valid outputToken CA you want to buy',
        };
        callback?.(responseMsg);
        return { status: 'incomplete info', parameters: formattedParameters};
      }
    }

    const client = await getSolanaClient(runtime);
    const programId = await client.getTokenProgramId(formattedParameters.inputTokenCA);

    if (
      !Number.isFinite(formattedParameters.inputTokenAmount) &&
      Number.isFinite(formattedParameters.inputTokenPercentage) &&
      formattedParameters.inputTokenPercentage != 0
    ) {
      const balance = await client.getUIBalance(formattedParameters.inputTokenCA);
      formattedParameters.inputTokenAmount = balance * formattedParameters.inputTokenPercentage;
    }

    if (
      !Number.isFinite(formattedParameters.inputTokenAmount) ||
      formattedParameters.inputTokenAmount <= 0
    ) {
      const responseMsg = {
        text: `Please provide a valid ${formattedParameters.inputTokenSymbol} input amount or output amount to perform the swap`,
      };
      callback?.(responseMsg);
      return { status: 'incomplete info', parameters: formattedParameters};
    }
    return {status: 'success', parameters: formattedParameters};
  },
  handler: handleExecuteSwap,
  examples: [] as ActionExample[][],
} as Action;

async function handleExecuteSwap(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback,
): Promise<ActionStatus> {
  const {parameters, status} = await checkResponse(
    runtime,
    message,
    state,
    _options,
    callback,
  );
  if (!status || status != 'success') {
    return status || 'failed';
  }

  const rpcUrl = getRuntimeKey(runtime, 'SOLANA_RPC_URL');
  const connection = new Connection(rpcUrl);
  const { keypair } = await getWalletKey(runtime, true);
  const decimals = await new SolanaClient(rpcUrl, keypair.publicKey).getMintDecimals(parameters.inputTokenCA);
  const {slippage, priorityFee, tip, mode } = await getTradeSettings(runtime.agentId);
  let txid: string;
  try {
    txid = await new SwapTokenService().swapToken(
      {
        connection,
        userWalletAddress: keypair.publicKey.toBase58(),
        inputTokenCA : parameters.inputTokenCA,
        outputTokenCA: parameters.outputTokenCA,
        amount: BigNumber(parameters.inputTokenAmount).multipliedBy(10 ** decimals).integerValue(),
        slippage,
        priorityFee,
        keyPair :keypair,
        mode,
        tip: tip * LAMPORTS_PER_SOL,
      });
  }catch (e){
    elizaLogger.error(`Error occurred while executing swap: ${e}`);
    callback?.({
      text: `${e}`,
      isError: true,
    });
    return 'failed';
  }
  elizaLogger.log(`Swap completed successfully! Transaction ID: ${txid}`);
  const responseMsg = {
    text: `Swap completed successfully! Transaction ID: ${txid}`,
  };
  callback?.(responseMsg);
  return 'success';
}

async function checkResponse(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback?: HandlerCallback,
): Promise<{
  status: ActionStatus;
  parameters?: {
    inputTokenAmount: number | null;
    inputTokenSymbol: string;
    inputTokenPercentage: number | null;
    outputTokenSymbol: string;
    inputTokenCA: string;
    outputTokenAmount: number | null;
    outputTokenCA: string;
    programId: PublicKey;
}
}> {
  const isAdmin = await isAgentAdmin(runtime, message);
  if (!isAdmin) {
    callback?.(NotAgentAdminResponse);
    return { status: 'rejected' };
  }

  // generate formatted response from chat
  let swapReq = convertNullStrings(state.actionParameters) as SwapTokenRequest;
  elizaLogger.log('Swap request:', swapReq);

  const client = await getSolanaClient(runtime);
  const programId = await client.getTokenProgramId(swapReq.inputTokenCA);

  if (
    Number.isFinite(swapReq.outputTokenAmount) &&
    swapReq.outputTokenAmount != 0
  ) {
    callback?.({
      text: `Specify the buy amount of a token is not supported now, ${swapReq.outputTokenAmount} will be ignored.`,
    });
    return { status: 'pending'};
  }

  const balance = await client.getUIBalance(swapReq.inputTokenCA);
  if (!balance) {
    const responseMsg = {
      text: 'Your input balance is 0.',
      result: 'Insufficient inputToken Balance',
    };
    callback?.(responseMsg);
    return { status: 'failed'};
  }

  if (balance < swapReq.inputTokenAmount) {
    const responseMsg = {
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${balance} available.`,
      result: 'Insufficient balance for swap',
    };
    callback?.(responseMsg);
    return { status: 'failed'};
  }

  const WSOL_AMOUNT = await client.getUIBalance(NATIVE_MINT.toBase58());
  const GAS_BALANCE = 0.001; // require 0.001 SOL for gas fee

  if (swapReq.inputTokenCA !== NATIVE_MINT.toBase58()) {
    // buy with token
    const balance = await client.getUIBalance(NATIVE_MINT.toBase58());
    if (balance < GAS_BALANCE) {
      elizaLogger.error('Insufficient balance for swap gas fee');
      const responseMsg = {
        text:
          `Insufficient balance for swap gas fee, required: ${GAS_BALANCE} SOL but only have: ` +
          balance,
        result: 'Insufficient balance for swap gas fee',
      };
      callback?.(responseMsg);
      return { status: 'failed'};
    }
  } else if (WSOL_AMOUNT - swapReq.inputTokenAmount < GAS_BALANCE) {
    // buy with SOL
    const requiredAmount = GAS_BALANCE + Number(swapReq.inputTokenAmount);
    elizaLogger.error('Insufficient balance for swap gas fee');
    const responseMsg = {
      text:
        `Insufficient balance for swap gas fee, required: ${requiredAmount} SOL but only have: ` +
        WSOL_AMOUNT,
      result: 'Insufficient balance for swap gas fee',
    };
    callback?.(responseMsg);
    return { status: 'failed'};
  }

  elizaLogger.info(`checking if user confirm to execute swap`);

  if (swapReq.pendingConfirmation === true) {
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
        result: 'User rejected the swap',
        action: 'EXECUTE_SWAP',
      };
      callback?.(responseMsg);
      return { status: 'cancelled'};
    } else if (confirmResponse.userAcked == "pending") {
      callback?.({
        text: "I repeatedly asked you to confirm the task although you have already confirmed it. It was my mistake. Please try again.",
        action: "EXECUTE_SWAP"
      });
      return { status: "pending" };
    } else if (confirmResponse.userAcked == "confirmed") {
      return {
        status: 'success',
        parameters: { ...swapReq, programId },
      };
    } else {
      callback?.({
        text: "I failed to recognize your confirmation. Please try again.",
        action: "EXECUTE_SWAP"
      });
      return { status: "failed" };
    }
  } else {
     const swapInfo = formatConfirmSwapInfo({
      inputTokenSymbol: swapReq.inputTokenSymbol,
      inputTokenCA: swapReq.inputTokenCA,
      outputTokenSymbol: swapReq.outputTokenSymbol,
      outputTokenCA: swapReq.outputTokenCA,
      inputTokenAmount: swapReq.inputTokenAmount,
      inputPercentage: ((swapReq.inputTokenAmount / balance) * 100).toFixed(1),
    });
    const responseMsg = {
      text: `${swapInfo}`,
      action: 'EXECUTE_SWAP',
      result: 'Pending user confirmation',
    };
    callback?.(responseMsg);
    return { status: 'pending'};
  }
}

function formatConfirmSwapInfo(params: {
  inputTokenSymbol: string;
  inputTokenCA: string;
  outputTokenSymbol: string;
  outputTokenCA: string;
  inputTokenAmount: number;
  inputPercentage: string;
}): string {
  const displayedInputSymbol = trimTokenSymbol(`$${params.inputTokenSymbol || params.inputTokenCA}`);
  const displayedOutputSymbol = trimTokenSymbol(`$${params.outputTokenSymbol || params.outputTokenCA}`);
  if (
    params.inputTokenCA !== NATIVE_MINT.toBase58() &&
    params.outputTokenCA !== NATIVE_MINT.toBase58()
  ) {
    return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
🔄 Type: Swap(swap ${displayedInputSymbol} for ${displayedOutputSymbol})
🪙 ${displayedInputSymbol}: ${params.inputTokenCA}
🪙 ${displayedOutputSymbol}: ${params.outputTokenCA}
💰 Swap amount: ${params.inputTokenAmount}
————
Reply 'ok' or 'yes' to confirm.`;
  }
  const swapType =
    params.outputTokenCA === NATIVE_MINT.toBase58() ? 'Sell' : 'Buy';
  const amountDescription =
    params.outputTokenCA === NATIVE_MINT.toBase58()
      ? `${displayedInputSymbol} (${params.inputPercentage}%)`
      : `${params.inputTokenAmount} ${displayedInputSymbol}`;
  const tokenDescription =
    params.outputTokenCA === NATIVE_MINT.toBase58()
      ? `${displayedInputSymbol} (${params.inputTokenCA})`
      : `${displayedOutputSymbol} (${params.outputTokenCA})`;
  return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
⬆️ Type: ${swapType}
🪙 Token: ${tokenDescription}
💰 ${swapType} Amount: ${amountDescription}
————
Reply 'ok' or 'yes' to confirm.`;
}
