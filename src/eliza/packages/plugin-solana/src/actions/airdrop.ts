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
  NotAgentAdminMessage,
  walletProvider,
} from '../providers/wallet.js';
import { Keypair } from '@solana/web3.js';
import axios from 'axios';

const claimAirdropTemplate = `
{{recentMessages}}

Given the recent messages, Extract the airdrop information from the message, Use null for any values that cannot be determined. The result should be a valid json object with the following fields:
{
    programName: string | null
}

for example:
claim airdrop of [Xnomad AI Initial funds]

The result should be a valid json object with the following fields:
{
    programName: "Xnomad AI Initial funds"
}
`;

export const airdrop: Action = {
  name: 'CLAIM_AIRDROP',
  similes: [],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description: 'Perform claim airdrop',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<boolean> => {
    const isAdmin = await isAgentAdmin(runtime, message);
    if (!isAdmin) {
      const responseMsg = {
        text: NotAgentAdminMessage,
      };
      callback?.(responseMsg);
      return true;
    }
    // composeState
    if (!state) {
      state = (await runtime.composeState(message)) as State;
    } else {
      state = await runtime.updateRecentMessageState(state);
    }

    const walletInfo = await walletProvider.get(runtime, message, state);

    state.walletInfo = walletInfo;

    const context = composeContext({
      state,
      template: claimAirdropTemplate,
    });

    const response = await generateObjectDeprecated({
      runtime,
      context: context,
      modelClass: ModelClass.LARGE,
    });

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
    [
      {
        user: '{{user1}}',
        content: {
          text: 'claim airdrop',
          action: 'CLAIM_AIRDROP',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'please provoide the project name you want to claim airdrop',
          action: 'CLAIM_AIRDROP',
        },
      },
      {
        user: '{{user1}}',
        content: {
          text: 'Xnomad AI Initial funds',
          action: 'CLAIM_AIRDROP',
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
    // Add more examples as needed
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

async function getAirdrops(runtime: IAgentRuntime, message: Memory) {
  const airdropServer =
    runtime.getSetting('AIRDROP_REGISTER_SERVER') ||
    process.env.AIRDROP_REGISTER_SERVER;
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
      // method: 'POST',
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
