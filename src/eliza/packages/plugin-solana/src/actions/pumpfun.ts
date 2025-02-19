import { AnchorProvider } from '@coral-xyz/anchor';
import { Wallet } from '@coral-xyz/anchor';
import axios from 'axios';
import {
  Commitment,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
} from '@solana/web3.js';
import {
  calculateWithSlippageBuy,
  CreateTokenMetadata,
  PriorityFee,
  PumpFunSDK,
  sendTx,
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
  elizaLogger,
} from '@elizaos/core';

import {
  isAgentAdmin,
  NotAgentAdminMessage,
} from '../providers/walletUtils.js';

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
}> {
  let createResults: TransactionResult;
  try {
    if (!tokenMetadata.name) {
      throw new Error('Token name is required');
    }
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
    createResults = await sdk.createAndBuy(
      deployer,
      mint,
      tokenMetadata,
      buyAmountSol,
      BigInt(slippage),
      priorityFee,
      commitment,
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

  if (createResults.success) {
    elizaLogger.log(
      'Success:',
      `https://pump.fun/${mint.publicKey.toBase58()}`,
    );

    return {
      success: true,
      ca: mint.publicKey.toBase58(),
      creator: deployer.publicKey.toBase58(),
    };
  } else {
    elizaLogger.error(`Create and Buy failed, ${createResults.error}`);
    return {
      success: true,
      ca: mint.publicKey.toBase58(),
    };
  }
}

// Save the base64 data to a file
import * as fs from 'fs';
import { getWalletKey } from '../keypairUtils.js';
import { getRuntimeKey } from '../environment.js';

const pumpfunTemplate = `
You are an expert on solana token creation, It mainly refers to token launches on Pump.fun.
Carefully read and understand the above conversation.Pay attention to distinguishing between completed conversations and newly initiated requests. 
Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "name": "GLITCHIZA",
    "symbol": "GLITCHIZA",
    "imageUrl":  ""
    "description": "A test token",
    "twitter": "https://x.com/elonmusk",
    "website": "https://x.com",
    "telegram": "https://t.me/+El39K_BrnIVhOWM1",
    "buyAmountSol": "0.00069"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract or generate (come up with if not included) the following information about the requested token creation:
- Token name
- Token symbol
- Token image url, the image path user uploaded, if not provided, it will be empty
- Token description
- Twitter URL
- Website URL
- Telegram URL
- Amount of SOL to buy

Respond with a JSON markdown block containing only the extracted values. Twitter URL, Website URL, Telegram URL is not must required, if not provided, it will be empty.
Amount of SOL to buy is not required, if not provided, it will be 0.
`;

export default {
  name: 'CREATE_TOKEN',
  similes: ['CREATE_PUMPFUN_TOKEN'],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return await isAgentAdmin(runtime, message);
  },
  description:
    'Create a new token on pumpfun and buy a specified amount using SOL. Requires the token name, symbol and image url, buy amount after create in SOL.',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<boolean> => {
    elizaLogger.log('Starting CREATE_TOKEN handler...');
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      const responseMsg = {
        text: NotAgentAdminMessage,
      };
      callback?.(responseMsg);
      return true;
    }

    // Generate structured content from natural language
    const pumpContext = composeContext({
      state,
      template: pumpfunTemplate,
    });

    const content = await generateObjectDeprecated({
      runtime,
      context: pumpContext,
      modelClass: ModelClass.LARGE,
    });

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
    if (!imageUrl) {
      callback({
        text:
          formatCreateTokenInfo(content) +
          `
        Please provide an image for the token.`,
      });
      return false;
    }
    if (!name) {
      callback({
        text:
          formatCreateTokenInfo(content) +
          `
        Please provide a name for the token.`,
      });
      return false;
    }
    if (!symbol) {
      callback({
        text:
          formatCreateTokenInfo(content) +
          `
        Please provide a symbol for the token.`,
      });
      return false;
    }
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
    try {
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

      if (callback) {
        if (result.success) {
          callback({
            text: `Token ${tokenMetadata.name} (${tokenMetadata.symbol}) created successfully!\nContract Address: ${result.ca}\nCreator: ${result.creator}\nView at: https://pump.fun/${result.ca}`,
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
        } else {
          callback({
            text: `Failed to create token: ${result.error}\nAttempted mint address: ${result.ca}`,
            content: {
              error: result.error,
              mintAddress: result.ca,
            },
          });
        }
      }
      const successMessage = `Token created success: ${result.success}!,  View at: https://pump.fun/${mintKeypair.publicKey.toBase58()}`;
      elizaLogger.log(successMessage);
      return result.success;
    } catch (error) {
      if (callback) {
        callback({
          text: `Error during pumpfun token creation: ${error.message}`,
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
          text: 'Create a new token called GLITCHIZA with symbol GLITCHIZA and generate a description about it on pump.fun, with twitter https://x.com/elonmusk, with website https://x.com, with telegram https://t.me/+El39K_BrnIVhOWM1, buy 0.0.00009 SOL worth.',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Token GLITCHIZA (GLITCHIZA) created successfully on pump.fun!\nContract Address: 3kD5DN4bbA3nykb1abjS66VF7cYZkKdirX8bZ6ShJjBB\nCreator: 9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa\nView at: https://pump.fun/EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r',
          action: 'CREATE_TOKEN',
          content: {
            tokenInfo: {
              symbol: 'GLITCHIZA',
              address: 'EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r',
              creator: '9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa',
              name: 'GLITCHIZA',
              description: 'A GLITCHIZA token',
              twitter: 'https://x.com/elonmusk',
              website: 'https://x.com',
              telegram: 'https://t.me/+El39K_BrnIVhOWM1',
            },
          },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

async function _uploadTokenMetadata(create: CreateTokenMetadata): Promise<any> {
  elizaLogger.log(`Uploading token metadata to IPFS... ${create.name}`);
  const formData = new FormData();
  formData.append('name', create.name);
  formData.append('symbol', create.symbol);
  formData.append('description', create.description || '');
  formData.append('twitter', create.twitter || '');
  formData.append('telegram', create.telegram || '');
  formData.append('website', create.website || '');
  formData.append('file', create.file);
  formData.append('showName', 'true');
  try {
    const response = await axios.post('https://pump.fun/api/ipfs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

async function _createAndBuyWithUrl(
  sdk: PumpFunSDK,
  creator: Keypair,
  mint: Keypair,
  createTokenMetadata: CreateTokenMetadata,
  buyAmountSol: bigint,
  slippageBasisPoints?: bigint,
  priorityFees?: PriorityFee,
  commitment?: Commitment,
  url?: string,
): Promise<TransactionResult> {
  const createTx = await sdk.getCreateInstructions(
    creator.publicKey,
    createTokenMetadata.name,
    createTokenMetadata.symbol,
    url,
    mint,
  );
  const newTx = new Transaction().add(createTx);
  if (buyAmountSol > 0) {
    const globalAccount = await sdk.getGlobalAccount('confirmed');
    const buyAmount = globalAccount.getInitialBuyPrice(buyAmountSol);
    const buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmountSol,
      BigInt(slippageBasisPoints),
    );
    const buyTx = await sdk.getBuyInstructions(
      creator.publicKey,
      mint.publicKey,
      globalAccount.feeRecipient,
      buyAmount,
      buyAmountWithSlippage,
    );
    newTx.add(buyTx);
  }
  const createResults = await sendTx(
    sdk.connection,
    newTx,
    creator.publicKey,
    [creator, mint],
    priorityFees,
    commitment,
  );
  return createResults;
}

function formatCreateTokenInfo(params: CreateTokenMetadata): string {
  return `
💱 Create Token On pump.fun
----------------------------
🔹 Name: ${params.name}

🔸 Symbol: ${params.symbol}

🔹 Description: ${params.description}

🔸 Twitter: ${params.twitter}

🔹 Website: ${params.website}

🔸 Telegram: ${params.telegram}
----------------------------
  `;
}
