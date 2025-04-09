import { AnchorProvider } from '@coral-xyz/anchor';
import { Wallet } from '@coral-xyz/anchor';
import axios from 'axios';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  CreateTokenMetadata,
  PriorityFee,
  PumpFunSDK,
  TransactionResult,
} from 'pumpdotfun-sdk';

import {
  settings,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelClass,
  State,
  generateObjectDeprecated,
  composeContext,
  type Action,
  elizaLogger, ActionStatus,
} from '@elizaos/core';

import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';

import * as fs from 'fs';
import { getWalletKey } from '../keypairUtils.js';
import { getRuntimeKey } from '../environment.js';
import { convertNullStrings } from '../providers/swapUtils.js';
import * as path from 'path';
import { SharedProvider } from '../index.js';

async function createAndBuyToken({
  deployer,
  mint,
  tokenMetadata,
  buyAmountSol,
  priorityFee,
  allowOffCurve,
  commitment = 'confirmed',
  sdk,
  slippage,
}: {
  deployer: Keypair;
  mint: Keypair;
  tokenMetadata: CreateTokenMetadata;
  buyAmountSol: bigint;
  priorityFee: PriorityFee;
  allowOffCurve: boolean;
  commitment?:
    | 'processed'
    | 'confirmed'
    | 'finalized'
    | 'recent'
    | 'single'
    | 'singleGossip'
    | 'root'
    | 'max';
  sdk: PumpFunSDK;
  slippage: string;
}): Promise<{
  success: boolean;
  ca: string;
  creator?: string;
  error?: any;
  signature?: string;
}> {
  let createResults: TransactionResult;
  elizaLogger.log(
    'Creating token with metadata:',
    deployer.publicKey.toBase58(),
    mint.publicKey.toBase58(),
    tokenMetadata,
    buyAmountSol,
    priorityFee,
    allowOffCurve,
    slippage,
  );
  try {
    createResults = await sdk.createAndBuy(
      deployer,
      mint,
      tokenMetadata,
      buyAmountSol,
      BigInt(slippage),
      priorityFee,
      commitment,
      'confirmed',
    );
  } catch (error) {
    elizaLogger.error('Error creating token:', error);
    return {
      success: false,
      ca: mint.publicKey.toBase58(),
      error: error.message || 'Transaction failed',
    };
  }

  elizaLogger.log('Create Results: ', createResults);
  return {
    success: createResults.success,
    ca: mint.publicKey.toBase58(),
    creator: deployer.publicKey.toBase58(),
    signature: createResults.signature,
  };
}

const userConfirmTemplate = `
{{recentMessages}}

Analyzing the user’s response to the create token confirmation. Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated unconfirmed requests.
Consider the latest messages from the conversation history above. Determine the user's response status regarding the confirmation.
Respond with a JSON:  
\`\`\`json
{
    "userAcked": "confirmed" | "rejected" | "pending"
}
\`\`\`  

**Decision Criteria:**  
"confirmed" → The user has explicitly confirmed using words like “yes”, “confirm”, “okay”, “sure”, etc.
"rejected" → The user has responded with anything other than a confirmation.
"pending" → The user has provided a complete swap request, but User2 has not yet sent the confirmation prompt.

**Additional Rules:**  
•If the user issues a new instruction without explicitly confirming or rejecting the previous one, treat it as “pending”.
•If the user has rejected a previous request but has now provided a new request, set userAcked to "pending".
•If the user has rejected a previous request and has not provided a new request, set userAcked to "rejected".
**Examples:**  

✅ **Should return \`"confirmed"\`**  
- User2: "Please confirm by replying with 'yes' or 'confirm'."  
- User1: "yes"  

- User2: "Please confirm."  
- User1: "okay"  

❌ **Should return \`"rejected"\`**  
- User2: "Please confirm by replying with 'yes' or 'confirm'"  
- User1: "no"  

- User1: "i want to create a token called GLITCHIZA with symbol GLITCHIZA"  
- User2: "Please confirm by replying with 'yes' or 'confirm'."  
- User1: "cancel"  

❓ **Should return \`"pending"\`**  
- User1: "swap 0.0001 SOL for USDC"  

- User1: "buy 0.1 SOL ELIZA"  

Return the JSON object with the \`userAcked\` field set to either \`"confirmed"\`, \`"rejected"\`, or \`"pending"\` based on the **immediate** response following the confirmation request.`;

export default {
  functionCallSpec: {
    name: 'CREATE_TOKEN',
    strict: true,
    additionalProperties: false,
    description:
      'Create a new token on pumpfun and buy a specified amount using SOL. Requires the token name, symbol and image url, buy amount after create in SOL.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the token to create' },
        symbol: {
          type: 'string',
          description: 'Symbol of the token to create',
        },
        imageUrl: {
          type: ['string', 'null'],
          description: 'Image URL or attachment file of the token to create',
        },
        description: {
          type: ['string', 'null'],
          description: 'Description of the token to create',
        },
        twitter: {
          type: ['string', 'null'],
          description: 'Twitter URL of the token to create',
        },
        website: {
          type: ['string', 'null'],
          description: 'Website URL of the token to create',
        },
        telegram: {
          type: ['string', 'null'],
          description: 'Telegram URL of the token to create',
        },
        buyAmountSol: {
          type: ['number', 'null'],
          description: 'Amount of SOL to buy after token creation',
        },
      },
      required: [
        'name',
        'symbol',
        'imageUrl',
        'description',
        'twitter',
        'website',
        'telegram',
        'buyAmountSol',
      ],
    },
  },
  name: 'CREATE_TOKEN',
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description:
    'Create a new token on pumpfun and buy a specified amount using SOL. Requires the token name, symbol and image url, buy amount after create in SOL.',
  formatParameters: async (runtime: IAgentRuntime, parameters: any, callback?: HandlerCallback) => {
    elizaLogger.log('parameters (formatParameters): ', parameters);
    const formattedParameters = parameters as any;
    if (formattedParameters.symbol?.startsWith('$')) {
      formattedParameters.symbol = formattedParameters.symbol.slice(1);
    }
    if (formattedParameters.name?.startsWith('$')) {
      formattedParameters.name = formattedParameters.name.slice(1);
    }
    const {
      name,
      symbol,
      imageUrl,
      description,
      twitter,
      website,
      telegram,
      buyAmountSol,
    } = formattedParameters;
    if (!imageUrl || !fs.existsSync(imageUrl)) {
      callback({
        text: `Please provide an image for the token.`,
      });
      return {status: 'incomplete info', parameters: formattedParameters};
    }
    if (!name) {
      callback({
        text: `Please provide a name for the token.`,
      });
      return {status: 'incomplete info', parameters: formattedParameters};
    }
    if (!symbol) {
      callback({
        text: `Please provide a symbol for the token.`,
      });
      return {status: 'incomplete info', parameters: formattedParameters};
    }
    return {status: 'success', parameters: formattedParameters};
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionStatus> => {
    elizaLogger.log('Starting CREATE_TOKEN handler...');
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      callback?.(NotAgentAdminResponse);
      return 'rejected';
    }
    const content = convertNullStrings(state.actionParameters) as any;
    elizaLogger.info('Generated content:', content);

    const {
      name,
      symbol,
      imageUrl,
      description,
      twitter,
      website,
      telegram,
      buyAmountSol,
    } = content;
    const tokenMetadata = {
      name,
      symbol,
      description,
      twitter,
      website,
      telegram,
    };
    elizaLogger.info(
      `Content for CREATE_AND_BUY_TOKEN action: ${JSON.stringify(content)}`,
    );

    elizaLogger.info(`checking if user confirm to execute`);

    if (content.pendingConfirmation === true) {
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
          text: 'ok. I will cancel the task.',
        };
        callback?.(responseMsg);
        return 'cancelled';
      } else if (confirmResponse.userAcked == "pending") {
        callback?.({
          text: "I repeatedly asked you to confirm the task although you have already confirmed it. It was my mistake. Please try again.",
          action: "CREATE_TOKEN"
        });
        return "pending";
      } else if (confirmResponse.userAcked == "confirmed") {
        const file = imageUrl ? await fs.openAsBlob(imageUrl) : null;
        const fullTokenMetadata: CreateTokenMetadata = {
          name: tokenMetadata.name,
          symbol: tokenMetadata.symbol,
          description: tokenMetadata.description,
          twitter: tokenMetadata.twitter,
          telegram: tokenMetadata.telegram,
          website: tokenMetadata.website,
          file: file,
        };

        // Default priority fee for high network load
        const priorityFee = {
          unitLimit: 500_000,
          unitPrice: 200_000,
        };
        const slippage = '400';

        // Get private key from settings and create deployer keypair
        const { keypair: deployerKeypair } = await getWalletKey(runtime, true);
        elizaLogger.log(`deployer: ${deployerKeypair.publicKey.toBase58()}`);
        // Generate new mint keypair
        const mintKeypair = Keypair.generate();
        elizaLogger.log(
          `Generated mint address: ${mintKeypair.publicKey.toBase58()}`,
        );

        // Setup connection and SDK
        const rpcUrl = getRuntimeKey(runtime, 'SOLANA_RPC_URL');
        const connection = new Connection(rpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 120000, // 120 seconds
          wsEndpoint: settings.SOLANA_RPC_URL!.replace('https', 'wss'),
        });

        elizaLogger.log(
          `rpc connection: ${rpcUrl}, ${deployerKeypair.publicKey.toBase58()}`,
        );

        const wallet = new Wallet(deployerKeypair);

        const provider: AnchorProvider = new AnchorProvider(connection, wallet, {
          commitment: 'confirmed',
        });
        const sdk = new PumpFunSDK(provider);
        const lamports = Math.floor(Number(buyAmountSol) * LAMPORTS_PER_SOL);

        elizaLogger.log(
          'Executing create and buy transaction...',
          deployerKeypair.publicKey,
          mintKeypair.publicKey,
        );
        if (!fullTokenMetadata.name) {
          throw new Error('fullTokenMetadata Token name is required');
        }

        SharedProvider.get<any>('tradeMonitorService').registerAgentCreatedToken({
          chain: 'solana',
          address: mintKeypair.publicKey.toBase58(),
          creatorAddress: deployerKeypair.publicKey.toBase58(),
          nftId: getRuntimeKey(runtime, 'NFT_ID'),
        });

        const result = await createAndBuyToken({
          deployer: deployerKeypair,
          mint: mintKeypair,
          tokenMetadata: fullTokenMetadata,
          buyAmountSol: BigInt(lamports),
          priorityFee,
          allowOffCurve: false,
          sdk,
          slippage,
        });

        if (result.success) {
          callback({
            text: `Transaction submitted, please wait for confirmation.\nCheck token on: https://pump.fun/${mintKeypair.publicKey.toBase58()}\nTransaction hash: ${result.signature}`,
            content: {
              tokenInfo: {
                symbol: tokenMetadata.symbol,
                address: result.ca,
                creator: result.creator,
                name: tokenMetadata.name,
                description: tokenMetadata.description,
                timestamp: Date.now(),
              },
            },
          });
          return 'success';
        } else {
          callback({
            text: `Failed to create token: ${result.error}\nAttempted mint address: ${result.ca}`,
            isError: true,
            content: {
              error: result.error,
              mintAddress: result.ca,
            },
          });
          return 'failed';
        }
      } else {
        callback?.({
          text: "I failed to recognize your confirmation. Please try again.",
          action: "CREATE_TOKEN"
        });
        return "failed";
      }
    } else {
      const confirmMessage = formatCreateTokenInfo(content);
      const responseMsg = {
        text: `${confirmMessage}`,
        action: 'CREATE_TOKEN',
        media: [
          {
            type: 'image',
            url: getImageAccessUrl(imageUrl),
          },
        ],
      };
      callback?.(responseMsg);
      return 'pending';
    }
  },

  examples: [
    [],
  ] as ActionExample[][],
} as Action;

function formatCreateTokenInfo(params: any): string {
  return `Please confirm the info below. If any adjustments are needed, let me know the updated details.
————
🎟️ Type: issue token
🪙 Token: $${params.symbol} (${params.name})
📝 Description: ${params.description || ''}
🐦 Twitter: ${params.twitter || ''}
📱 Telegram: ${params.telegram || ''}
🌐 Website: ${params.website || ''}
💰 Buy amount: ${params.buyAmountSol || 0} SOL
————
Reply 'ok' or 'yes' to confirm.`;
}

function getImageAccessUrl(imageUrl: string): string {
  return imageUrl.startsWith('http')
    ? imageUrl
    : `/media/uploads/${path.basename(imageUrl)}`;
}
