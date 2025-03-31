import {
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
import { getWalletKey } from '../providers/keypairUtils.js';
import { convertNullStrings, getRuntimeDefaultChain, getRuntimeKey } from '../providers/environment.js';
import * as path from 'path';
import { SharedProvider } from '../index.js';
import { userConfirmTemplate } from '../providers/type.js';
import { ethers } from 'ethers';

export default {
  functionCallSpec: {
    name: 'CREATE_TOKEN',
    strict: true,
    additionalProperties: false,
    description:
      'Create a new meme token on four.meme and buy a specified amount using BNB. Requires the token name, symbol and image url, buy amount after create in BNB.',
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
        buyAmount: {
          type: ['number', 'null'],
          description: 'Amount of BNB to buy after token creation',
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
        'buyAmount',
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
    if (content.symbol?.startsWith('$')) {
      content.symbol = content.symbol.slice(1);
    }
    if (content.name?.startsWith('$')) {
      content.name = content.name.slice(1);
    }
    elizaLogger.info(
      `Content for CREATE_AND_BUY_TOKEN: ${JSON.stringify(content)}`,
    );
    const {
      name,
      symbol,
      imageUrl,
      description,
      twitter,
      website,
      telegram,
      buyAmount,
    } = content;

    if (!imageUrl || !fs.existsSync(imageUrl)) {
      callback({
        text: `Please provide an image for the token.`,
      });
      return 'pending';
    }
    if (!name) {
      callback({
        text: `Please provide a name for the token.`,
      });
      return 'pending';
    }
    if (!symbol) {
      callback({
        text: `Please provide a symbol for the token.`,
      });
      return 'pending';
    }

    elizaLogger.info(`checking if user confirm to execute`);

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
    }

    if (confirmResponse.userAcked == 'pending') {
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
    const file = imageUrl ? await fs.openAsBlob(imageUrl) : null;
    const chain = getRuntimeDefaultChain(runtime);
    const {address, privateKey} = await getWalletKey(runtime, true);
    const wallet = new ethers.Wallet(privateKey);
    const fourMemeApi = SharedProvider.get<any>('fourMemeApi');
    const userToken = await fourMemeApi.login(wallet);
    const fileBuffer = await file.arrayBuffer();
    const uploadedImageUrl = await fourMemeApi.uploadImage(userToken, Buffer.from(fileBuffer));
    const quote = await fourMemeApi.getCreateTokenQuote(userToken, {
      name,
      symbol,
      description,
      image: uploadedImageUrl,
      initialBuyAmount: buyAmount,
      twitter,
      telegram,
      website,
    });
    const { tokenAddress, txid } = await fourMemeApi.createAndBuyToken(wallet, quote, buyAmount);
    elizaLogger.info(`Created Token info: ${tokenAddress}, txid: ${txid}`);

    SharedProvider.get<any>('tradeMonitorService').registerAgentCreatedToken({
      chain,
      address: tokenAddress,
      creatorAddress: address,
      nftId: getRuntimeKey(runtime, 'NFT_ID'),
      name,
      symbol,
      decimals: 18,
      description,
      logo: uploadedImageUrl,
      twitter,
      telegram,
      website,
      deployedTime: Date.now(),
    });
    callback({
      text: `Transaction submitted, please wait for confirmation.\nCheck token on: https://four.meme/token/${tokenAddress}\nTransaction hash: ${txid}`,
    });
    return 'success';
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
💰 Buy amount: ${params.buyAmount || 0} BNB
————
Reply 'ok' or 'yes' to confirm.`;
}

function getImageAccessUrl(imageUrl: string): string {
  return imageUrl.startsWith('http')
    ? imageUrl
    : `/media/uploads/${path.basename(imageUrl)}`;
}
