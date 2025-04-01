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

import { getWalletKey } from '../providers/keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import {
  convertNullStrings,
  getChainRPC,
  getEvmClient,
  getRuntimeDefaultChain,
} from '../providers/environment.js';
import {
  getTokenCABySymbol,
  trimTokenSymbol,
  validateAndAssignCA,
} from '../providers/tokenUtils.js';
import { getTradeSettings, SwapTokenService } from '../providers/swapTokenService.js';
import { BigNumber } from 'bignumber.js';
import { userConfirmTemplate } from '../providers/type.js';
import { EVMClient, nativeTokenAddress } from '../providers/evmClient.js';
import { getSwapTokenFees } from '../providers/swapUtils.js';

interface SwapTokenRequest {
  inputTokenSymbol: string;
  inputTokenCA: string;
  outputTokenSymbol: string;
  outputTokenCA: string;
  inputTokenAmount: string | null;
  inputTokenPercentage: number | null;
  outputTokenAmount: string | null;
}

export const executeSwap: Action = {
  functionCallSpec: {
    name: 'EXECUTE_SWAP',
    strict: true,
    additionalProperties: false,
    description:
      "Swap tokens on EVM blockchain. When the user specifies 'buy <token>', the default input token is native token. When the user specifies 'sell <token>', the default output token is native token.",
    parameters: {
      type: 'object',
      properties: {
        inputTokenSymbol: {
          type: ['string', 'null'],
          description:
            "Symbol of the token to sell. Defaults to native token of the chain when buying another token. Either inputTokenSymbol or inputTokenCA must be provided.",
        },
        inputTokenCA: {
          type: ['string', 'null'],
          description:
            'Contract address of the token to sell. Either inputTokenSymbol or inputTokenCA must be provided.',
        },
        outputTokenSymbol: {
          type: ['string', 'null'],
          description:
            "Symbol of the token to buy. Defaults to native token of the chain when selling another token. Either outputTokenSymbol or outputTokenCA must be provided.",
        },
        outputTokenCA: {
          type: ['string', 'null'],
          description:
            'Contract address of the token to buy. Either outputTokenSymbol or outputTokenCA must be provided.',
        },
        inputTokenAmount: {
          type: ['string', 'null'],
          description:
            'Exact amount of the input token to swap. Required if inputTokenPercentage is not provided.',
        },
        inputTokenPercentage: {
          type: ['number', 'null'],
          description:
            'Percentage of the input token balance to swap. Required if inputTokenAmount is not provided. When extracting percentages, convert values like "50%" into decimal form (e.g., 0.5 instead of 50).',
        },
        outputTokenAmount: {
          type: ['string', 'null'],
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
    'Perform a EVM token swap. buy or sell tokens, supports native token and ERC20 token swaps.',
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

  const chain = getRuntimeDefaultChain(runtime);
  const rpcUrl = getChainRPC(runtime, chain);
  const evmClient = getEvmClient(runtime, chain);
  const { address, privateKey } = await getWalletKey(runtime, true);
  const tradeSettings = await getTradeSettings(runtime.agentId, chain);
  const decimals = await evmClient.getTokenDecimals(parameters.inputTokenCA);
  const fees = await getSwapTokenFees(runtime.databaseAdapter, chain, parameters.inputTokenCA, parameters.outputTokenCA);
  const txid = await new SwapTokenService().swapToken(
    {
      ...tradeSettings,
      rpcUrl,
      chainName: chain,
      userWalletAddress: address,
      privateKey,
      inputTokenCA : parameters.inputTokenCA,
      outputTokenCA: parameters.outputTokenCA,
      amount: BigNumber(parameters.inputTokenAmount).multipliedBy(10 ** decimals).toFixed(0),
      exactFees: fees,
    });
  
  elizaLogger.log(`Swap completed successfully! Transaction ID: ${txid}`);
  callback?.({
    text: `Swap completed successfully! Transaction ID: ${txid}`,
  });
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
    inputTokenAmount: string | null;
    inputTokenSymbol: string;
    inputTokenPercentage: number | null;
    outputTokenSymbol: string;
    inputTokenCA: string;
    outputTokenAmount: string | null;
    outputTokenCA: string;
}
}> {
  const isAdmin = await isAgentAdmin(runtime, message);
  if (!isAdmin) {
    callback?.(NotAgentAdminResponse);
    return { status: 'rejected' };
  }

  // generate formatted response from chat
  let swapReq = convertNullStrings(state.actionParameters) as SwapTokenRequest;
  const chain = getRuntimeDefaultChain(runtime);
  const client = getEvmClient(runtime, chain);
  const {address} = await getWalletKey(runtime, true);
  elizaLogger.info('Swap request:', swapReq);
  if (client.isNativeToken(swapReq.inputTokenSymbol)) {
    swapReq.inputTokenCA = nativeTokenAddress;
  }
  if (client.isNativeToken(swapReq.outputTokenSymbol)) {
    swapReq.outputTokenCA = nativeTokenAddress;
  }
  swapReq.inputTokenCA = validateAndAssignCA(
    swapReq.inputTokenSymbol,
    swapReq.inputTokenCA,
  );
  swapReq.outputTokenCA = validateAndAssignCA(
    swapReq.outputTokenSymbol,
    swapReq.outputTokenCA,
  );

  if (!swapReq.inputTokenCA) {
    swapReq.inputTokenCA = await getTokenCABySymbol(
      runtime,
      chain,
      swapReq.inputTokenSymbol,
    );
    if (!swapReq.inputTokenCA) {
      const responseMsg = {
        text: 'Please provide a valid inputToken CA you want to sell',
        result: 'Pending inputToken CA',
      };
      callback?.(responseMsg);
      return { status: 'pending'};
    }
  }

  if (!swapReq.outputTokenCA) {
    swapReq.outputTokenCA = await getTokenCABySymbol(
      runtime,
      chain,
      swapReq.outputTokenSymbol,
    );
    if (!swapReq.outputTokenCA) {
      const responseMsg = {
        text: 'Please provide a valid outputToken CA you want to buy',
        result: 'Pending outputToken CA',
      };
      callback?.(responseMsg);
      return { status: 'pending'};
    }
  }

  if (
    swapReq.outputTokenAmount &&
    +swapReq.outputTokenAmount > 0
  ) {
    callback?.({
      text: `Specify the buy amount of a token is not supported now, ${swapReq.outputTokenAmount} will be ignored.`,
      result: 'Pending outputToken Amount',
    });
    return { status: 'pending'};
  }

  const uiBalance = await client.getTokenUIBalance(swapReq.inputTokenCA, address);

  if (!uiBalance) {
    const responseMsg = {
      text: 'Your input balance is 0.',
      result: 'Insufficient inputToken Balance',
    };
    callback?.(responseMsg);
    return { status: 'failed'};
  }

  if (
    !swapReq.inputTokenAmount &&
    Number.isFinite(swapReq.inputTokenPercentage) &&
    swapReq.inputTokenPercentage != 0
  ) {
    swapReq.inputTokenAmount = BigNumber(uiBalance).multipliedBy(swapReq.inputTokenPercentage).toString();
  }

  if (!swapReq.inputTokenAmount || +swapReq.inputTokenAmount <= 0) {
    const responseMsg = {
      text: `Please provide a valid ${swapReq.inputTokenSymbol} input amount to perform the swap`,
      action: 'EXECUTE_SWAP',
      result: 'Pending inputToken Amount',
    };
    callback?.(responseMsg);
    return { status: 'pending'};
  }

  if (BigNumber(uiBalance).lt(swapReq.inputTokenAmount)) {
    const responseMsg = {
      text: `Insufficient balance for swap, required: ${swapReq.inputTokenAmount} but only ${uiBalance} available.`,
      result: 'Insufficient balance for swap',
    };
    callback?.(responseMsg);
    return { status: 'failed'};
  }

  elizaLogger.info(`checking if user confirm to execute swap`);

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
    };
    callback?.(responseMsg);
    return { status: 'cancelled'};
  }

  if (confirmResponse.userAcked == 'pending') {
    const swapInfo = formatConfirmSwapInfo({
      inputTokenSymbol: swapReq.inputTokenSymbol,
      inputTokenCA: swapReq.inputTokenCA,
      outputTokenSymbol: swapReq.outputTokenSymbol,
      outputTokenCA: swapReq.outputTokenCA,
      inputTokenAmount: swapReq.inputTokenAmount,
      inputPercentage: (BigNumber(swapReq.inputTokenAmount).div(uiBalance).times(100).toFixed(1)),
    });
    const responseMsg = {
      text: `${swapInfo}`,
      action: 'EXECUTE_SWAP',
      result: 'User pending the swap',
    };
    callback?.(responseMsg);
    return { status: 'pending'};
  }

  return {
    status: 'success',
    parameters: { ...swapReq },
  };
}

function formatConfirmSwapInfo(params: {
  inputTokenSymbol: string;
  inputTokenCA: string;
  outputTokenSymbol: string;
  outputTokenCA: string;
  inputTokenAmount: string;
  inputPercentage: string;
}): string {
  const displayedInputSymbol = trimTokenSymbol(`$${params.inputTokenSymbol || params.inputTokenCA}`);
  const displayedOutputSymbol = trimTokenSymbol(`$${params.outputTokenSymbol || params.outputTokenCA}`);
  if (
    params.inputTokenCA !== nativeTokenAddress &&
    params.outputTokenCA !== nativeTokenAddress
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
    params.outputTokenCA === nativeTokenAddress ? 'Sell' : 'Buy';
  const amountDescription =
    params.outputTokenCA === nativeTokenAddress
      ? `${displayedInputSymbol} (${params.inputPercentage}%)`
      : `${params.inputTokenAmount} ${displayedInputSymbol}`;
  const tokenDescription =
    params.outputTokenCA === nativeTokenAddress
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
