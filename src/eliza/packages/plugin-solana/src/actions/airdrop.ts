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
  elizaLogger,
} from '@elizaos/core';
import { getWalletKey, sign } from '../keypairUtils.js';
import {
  isAgentAdmin,
  NotAgentAdminResponse,
} from '../providers/walletUtils.js';
import { Keypair } from '@solana/web3.js';
import axios from 'axios';
import { getRuntimeKey } from '../environment.js';
import { convertNullStrings } from '../providers/swapUtils';

export const airdrop: Action = {
  functionCallSpec: {
    name: 'CLAIM_AIRDROP',
    strict: true,
    additionalProperties: false,
    description: 'Perform claim airdrop for the user agent account',
    parameters: {
      type: 'object',
      properties: {
        programName: { type: ['string', 'null'], description: 'The program name of the airdrop' },
      },
      required: ['programName'],
    },
  },
  name: 'CLAIM_AIRDROP',
  similes: [],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description: 'Perform claim airdrop for the user agent account',
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
    const response = convertNullStrings(state.actionParameters);
    elizaLogger.log('Response:', response);
    if (!response.programName) {
      const responseMsg = {
        text: 'Please tell me the program name of the airdrop',
        action: 'CLAIM_AIRDROP',
      };
      callback?.(responseMsg);
      return true;
    }

    const airdrops = await getAirdrops(runtime, message);
    if (!airdrops) {
      const responseMsg = {
        text: `It looks like you don’t have any airdrops available right now.`,
      };
      callback?.(responseMsg);
      return false;
    }

    const airdrop = airdrops.find((a) => a.name === response.programName);
    if (!airdrop) {
      const responseMsg = {
        text: `Airdrop [${response.programName ?? ''}] not found`,
        action: 'CLAIM_AIRDROP',
      };
      callback?.(responseMsg);
      return false;
    }
    if (airdrop.rules.claimMethod != 'http' || !airdrop.rules.claimUrl) {
      const responseMsg = {
        text: `Only http claim method is supported now. Claim URL: ${response.airdrop.claimUrl}`,
      };
      callback?.(responseMsg);
      return false;
    }

    const { keypair } = await getWalletKey(runtime, true);
    elizaLogger.info(`Claiming airdrop for:, ${keypair.publicKey.toBase58()}`);
    try {
      const { status, message } = await claimAirdrop(runtime, keypair, airdrop);
      if (status) {
        const responseMsg = {
          text: `Airdrop claimed successfully. Please wait and check your wallet for the airdrop.`,
        };
        callback?.(responseMsg);
        return true;
      } else {
        const responseMsg = {
          text: message ? message : `claim airdrop failed`,
        };
        callback?.(responseMsg);
        return false;
      }
    } catch (error) {
      elizaLogger.error(`Error during claim airdrop ${error}`);
      const responseMsg = {
        text: `Error during claim airdrop: ${error}`,
      };
      callback?.(responseMsg);
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'claim airdrop of [Xnomad AI Initial funds]',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: '[Xnomad AI Initial funds] Airdrop claimed successfully. 0.01 SOL will be transferred to your wallet.',
          action: 'CLAIM_AIRDROP',
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

interface AirdropRegistry {
  protocol: string;
  version: string;
  name: string;
  description: string;
  issuer: {
    name: string;
    officialWebsite: string;
    image: string;
    twitter: string;
    telegram: string;
    discord: string;
    contract: string;
    token: string;
    createdAt: Date;
    updatedAt: Date;
  };
  rules: {
    target: string;
    claimMethod: string;
    claimUrl: string;
    checkEligibilityUrl: string;
    claimMessage: string;
    blockchain: string;
    contract: string;
    supportDelegate: boolean;
    startAt: Date;
    expiresAt: Date;
    estimateCost: number;
    createdAt: Date;
    updatedAt: Date;
  };
}

async function getAirdrops(runtime: IAgentRuntime, _message: Memory) {
  const airdropServer = getRuntimeKey(runtime, 'AIRDROP_REGISTER_SERVER');
  const url = `${airdropServer}/registry`;
  const response = await fetch(url);
  const result = await response.json();
  return result?.data as AirdropRegistry[];
}

async function claimAirdrop(
  runtime: IAgentRuntime,
  keypair: Keypair,
  airdrop: AirdropRegistry,
): Promise<{
  status: boolean;
  message: string;
}> {
  const url = airdrop.rules.claimUrl;
  const messageToSign = airdrop.rules.claimMessage || String(Date.now());
  const signature = sign(messageToSign, keypair);
  const defaultFailedRes = { status: false, message: '' };

  try {
    // check if already claimed
    elizaLogger.log(
      `check Claiming status ${airdrop.rules.checkEligibilityUrl} ${keypair.publicKey.toBase58()}`,
    );
    const checkResponse = await axios.post(
      airdrop.rules.checkEligibilityUrl,
      { agentAddress: keypair.publicKey.toBase58() },
      {
        // method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const checkJson: {
      success: boolean;
      claimable: boolean;
      claimed: boolean;
    } = await checkResponse.data;

    if (!checkJson.success) return defaultFailedRes;
    if (checkJson.success && checkJson.claimed) {
      return { status: false, message: 'You Have Already Claimed!' };
    }
    elizaLogger.log(`check Claiming status res: ${JSON.stringify(checkJson)}`);

    // send claim request
    const body = JSON.stringify({
      walletAddress: keypair.publicKey.toBase58(),
      message: messageToSign,
      signature: signature,
      agentAddress: keypair.publicKey.toBase58(),
    });
    elizaLogger.log(`Claiming airdrop request:, ${body}`);
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status != 200 && response.status != 201) {
      elizaLogger.error(
        `Error during claim airdrop: ${response.status} ${response.data}`,
      );
      return defaultFailedRes;
    }
    return { status: true, message: '' };
  } catch (e) {
    elizaLogger.error(`Error during claim airdrop ${e}`);
    return defaultFailedRes;
  }
}
