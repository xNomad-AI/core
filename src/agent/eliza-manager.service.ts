import { DirectClient } from '@elizaos/client-direct';
import {
  Character,
  IDatabaseAdapter,
  ModelProviderName,
  stringToUuid,
} from '@elizaos/core';

import { TEEMode } from '@elizaos/plugin-tee';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import { startAgent } from '../eliza/starter/index.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { CharacterConfig} from '../shared/mongo/types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { sleep } from '../shared/utils.service.js';
import { WalletProxyService } from '../wallet/wallet-proxy.service.js';
import { SettingsService } from '../nft/core-settings.service.js';
import { NftConfigService } from '../nft/nft-config.service.js';
import { ClientName } from '../eliza/starter/clients/index.js';
import { normalizeBlockchainAddress } from '../nft/nft.types.js';
import { initializeDatabase } from '../eliza/starter/database/index.js';

export type ElizaAgentConfig = {
  chain: string;
  nftId: string;
  character: Character;
  characterConfig: CharacterConfig;
};

@Injectable()
export class ElizaManagerService {
  private elizaClient: DirectClient;

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly mongoService: MongoService,
    private readonly walletProxyService: WalletProxyService,
    private readonly settingsService: SettingsService,
    private readonly nftConfigService: NftConfigService,
  ) {
    logger.setContext(ElizaManagerService.name);
    this.elizaClient = new DirectClient();
    this.elizaClient.startAgent = this.directClientStartAgent.bind(this);
  }

  private async preStartAgent(character: Character, nftId?: string) {
    if (!nftId) return;

    const twitterUsername = character.settings?.secrets?.TWITTER_USERNAME;
    if (twitterUsername) {
      // if proxy not exists, get one
      let httpProxy = character.settings?.secrets?.TWITTER_HTTP_PROXY;
      if (!httpProxy) {
        httpProxy = await this.settingsService.randomGetHttpProxy();
      }

      if (!httpProxy) {
        this.logger.warn(
          'No http proxy found for Twitter client',
          twitterUsername,
        );
      } else {
        // should use the same proxy for the same user to provide a stable service
        await this.nftConfigService.updateNftTwitterHttpProxy(nftId, httpProxy);
        character.settings.secrets.TWITTER_HTTP_PROXY = httpProxy;
      }
    }
  }

  private async postStartAgent(
    character: Character,
    errors: Record<ClientName, any>,
    nftId?: string,
  ) {
    if (!nftId) return;

    // if client start success, increase the http proxy count so that the next client can use the other proxy
    let httpProxy = character.settings?.secrets?.TWITTER_HTTP_PROXY;
    if (httpProxy && errors['client-twitter'] === null) {
      await this.settingsService.increaseHttpProxyCount(httpProxy);
    }
  }

  private async directClientStartAgent(character: Character, nftId?: string) {
    try {
      await this.preStartAgent(character, nftId);
      const { runtime, errors } = await startAgent(
        character,
        this.elizaClient,
        nftId,
        {
          mongoClient: this.mongoService.client,
        },
      );
      if (errors['client-telegram'] || errors['client-twitter']) {
        this.logger.error(
          `nftId: ${nftId} start with errors : ${JSON.stringify(errors)}`,
        );
      }

      await this.postStartAgent(character, errors, nftId);

      return runtime;
    } catch (error) {
      this.logger.error(`Failed to start agent for NFT ${nftId}: ${error}`);
      // throw error;
    }
  }

  async startAgentServer() {
    try {
      this.elizaClient.start(this.appConfig.get<number>('AGENT_SERVER_PORT'));
    } catch (e) {
      this.logger.error(`Failed to start agent server: ${e.message}`);
      await sleep(10000);
      this.startAgentServer();
    }
  }

  async isAgentRunning(agentId: string) {
    return !!this.elizaClient.agents.get(agentId);
  }

  async startAgentLocal(config: ElizaAgentConfig) {
    try {
      const character = await this.initAgentCharacter(config);
      await this.directClientStartAgent(character, config.nftId);
    } catch (e) {
      this.logger.error(
        `Failed to start agent for NFT ${config.nftId}: ${e.message}`,
      );
    }
  }

  async stopAgent(agentId: string) {
    // stop all running clients of agent
    try {
      const runtime = this.elizaClient.agents.get(agentId);
      await runtime.stop();
    } catch (e) {
      this.logger.error(e);
    }
  }

  async getAgentStatus(agentId) {
    const runtime = this.elizaClient.agents.get(agentId);
    if (!runtime) {
      return {
        status: 'stopped',
      };
    }
    return {
      status: 'running',
    };
  }

  async deleteAgentMemory(
    agentId: string,
    opts?: {
      roomId?: string;
      userId?: string;
      memoryId?: string;
    },
  ) {
    const filter: any = { agentId };
    if (opts.roomId) {
      filter.roomId = stringToUuid(opts.roomId);
    }
    if (opts.userId) {
      filter.roomId = stringToUuid(opts.userId);
    }
    if (opts?.memoryId) {
      filter.id = opts.memoryId;
    }
    await this.mongoService.client
      .db('agent')
      .collection('memories')
      .deleteMany(filter);
    await this.mongoService.client
      .db('agent')
      .collection('tasks')
      .deleteMany(filter);
  }

  async initAgentDB(): Promise<IDatabaseAdapter>{
    const db = await initializeDatabase(this.mongoService.client, 'agent');
    return db;
  }

  getElizaEnvs(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(([_, v]) => v !== undefined),
    ) as Record<string, string>;
  }

  getAgentSecretSalt(chain: string, nftId: string) {
    const prefix = this.appConfig.get<string>('AGENT_SECRET_SALT_PREFIX');
    if (!prefix) {
      throw new Error('AGENT_SECRET_SALT_PREFIX is not set');
    }
    return `${prefix}-${chain}:${nftId}`;
  }

  async getAgentAccount(
    chain: string,
    nftId: string,
    agentId?: string,
  ): Promise<{ solana: string; evm: string }> {
    const secrectSalt = this.getAgentSecretSalt(chain, nftId);
    agentId ??= stringToUuid(nftId);

    const { publicKey, evmAddress } =
      await this.walletProxyService.getWalletKey(
        secrectSalt,
        agentId,
        this.appConfig.get<string>('TEE_MODE') as TEEMode,
        false,
      );

    return {
      solana: publicKey.toBase58(),
      evm: evmAddress,
    };
  }

  async getAgentAccountKeypair(
    chain: string,
    nftId: string,
    agentId?: string,
  ): Promise<{ solanaKeypair: Keypair, evmAddress: string, evmPrivateKey: string }> {
    const secrectSalt = this.getAgentSecretSalt(chain, nftId);
    agentId ??= stringToUuid(nftId);

    const { keypair, evmAddress, evmPrivateKey } = await this.walletProxyService.getWalletKey(
      secrectSalt,
      agentId,
      this.appConfig.get<string>('TEE_MODE') as TEEMode,
      true,
    );

    return {
      solanaKeypair: keypair,
      evmAddress,
      evmPrivateKey,
    };
  }

  async initAgentCharacter(config: ElizaAgentConfig) {
    const { chain, nftId, characterConfig } = config;
    let { character } = config;
    character = {
      ...character,
      ...characterConfig,
      modelProvider: this.appConfig.get<ModelProviderName>(
        'AGENT_MODEL_PROVIDER',
      ),
    };
    const envVars = this.getElizaEnvs();
    const salt = this.getAgentSecretSalt(chain, nftId);
    const teeMode = this.appConfig.get<string>('TEE_MODE');
    if (!character.settings) {
      character.settings = {};
    }
    character.settings.secrets = {
      ...envVars,
      ...character.settings?.secrets,
    };
    character.settings.secrets['TEE_MODE'] = teeMode;
    character.settings.secrets['WALLET_SECRET_SALT'] = salt;
    character.settings.secrets['NFT_CHAIN'] = chain;
    character.settings.secrets['NFT_ID'] = nftId;
    // For compatibility with Eliza environment variable reading
    character.settings['WALLET_SECRET_SALT'] = salt;
    character.settings['TEE_MODE'] = teeMode;
    character.settings['NFT_CHAIN'] = chain;
    character.settings['NFT_ID'] = nftId;
    character.settings.modelConfig = {
      ...character.settings.modelConfig,
      temperature: 0.2,
    };
    const { solana, evm } = await this.getAgentAccount(chain, nftId);
    character.knowledge = character.knowledge || [];
    character.knowledge.push(`
1. You are an AI Agent running in TEE with name: ${character.name}, generated by xNomad AI-NFT. You support Solana and EVM token trading now, and other blockchains will be supported in the future.
2. You have multiple wallet addresses: Solana: ${solana}, EVM: ${evm}, it's public and can be shared with users.
`);

    character.system = `
# Task: You are a conversational agent assisting the user with various operations, including but not limited to solana and evm blockchain actions. Your goal is to identify the user's intent, determine if it matches any available actions.

# Instructions:
1. Identify whether the user's intent matches any registered action.
2. If an action is matched, ask for any missing parameters.
3. If all parameters are provided, return the function call in valid JSON format.
4. **If the user's input does not match any registered action, OR it contains general conversation topics (e.g., greetings, small talk, humor, identity questions), set \`action = "none"\` and generate a normal conversational reply.**
5. If a previous action is **unfinished**, but the new message is unrelated (i.e., normal conversation), **immediately reset action = "none"**.

# **Actions**:
`;
    character.templates = character.templates || {};
    character.templates.messageHandlerTemplate = ` 
# Task: Carefully analyze the conversation context to determine the action for {{agentName}}.

# Instructions: Generate the next message in valid JSON format for {{agentName}}. The action and parameters must be filled dynamically according to the provided context. Ensure that the parameters are valid JSON objects, not string representations.

# Instructions:
1. **Intent Detection**:
   - If the user's message contains normal conversation topics such as:
     - Greetings: "hello", "hi", "hey"
     - Identity: "who are you", "what's your name"
     - Small talk: "how are you", "tell me a joke"
     - Unrelated queries: "what's the weather"
   - Then immediately **reset** \`action = "none"\` and generate a normal conversational reply.

2. **Error Recovery Protocol**:
   - If previous messages contain errors marked with \`isError\`: true:
     - Check if the user's new message indicates they have resolved the issue (e.g., "I've added funds", "I'm logged in now", "try again")
     - If so, IGNORE the previous error message and RE-ATTEMPT the original action with the same parameters
     - Consider these messages as requests to retry the previous failed action

3. **If the user's intent matches a registered action**:
   - Ensure that all necessary parameters are collected.
   - If any parameters are missing, ask the user for clarification.
   - Once all parameters are gathered, return a **valid JSON function call**.

4. **If the user has an incomplete previous action**:
   - If the new message **continues** the previous action, proceed.
   - **If the new message is unrelated (e.g., general conversation), reset \`action = "none"\`**.

**Format** 
    { 
    "action": "<string>",
    "parameters": "<object>"
} 

{{attachments}} 
  
{{recentMessages}} 
`;
    return character;
  }

  async isAgentOwner(agentId: string, ownerAddress: string) {
    const nft = await this.mongoService.nfts.findOne({ agentId });
    ownerAddress = normalizeBlockchainAddress(nft?.chain, ownerAddress);
    const owner = await this.mongoService.nftOwners.findOne({
      chain: nft?.chain,
      contractAddress: nft?.contractAddress,
      tokenId: nft?.tokenId,
    });
    return owner?.ownerAddress === ownerAddress;
  }

  async ensureAgentOwner(agentId: string, ownerAddress: string) {
    if (!(await this.isAgentOwner(agentId, ownerAddress))) {
      throw new ForbiddenException('You are not the owner of this Agent');
    }
  }

  async getPrologue(chain: string, nftId: string) {
    const result = await this.mongoService.nftPrologues.findOne({
      chain,
      nftId,
    });
    if (result) {
      return result.prologue;
    }
    const nft = await this.mongoService.nfts.findOne({chain, nftId});
    const prologue = [
      `Hey! I'm ${nft.aiAgent.character.name}, your all-in-one crypto assistant. I can help you trade, transfer tokens, claim airdrops, copy top traders, check token info, and more. Just tell me what you need — I'll handle it all on-chain`,
      `Hi, I'm ${nft.aiAgent.character.name}, your crypto AI assistant. Need to trade tokens, send tokens, claim airdrops, follow pro traders, or get token insights? I've got it covered. Just say the word, and I'll take care of it.`,
      `Hey there! I'm ${nft.aiAgent.character.name}, your reliable crypto assistant. I make your crypto journey simplest — from trading and transfers to airdrops, copy trades, and token info. Just tell me what to do, and I'll do the rest.`,
      `Hey there! I'm ${nft.aiAgent.character.name}, your personal crypto assistant. Want me to trade, send tokens, claim airdrops, or check token data for you? Just ask — I'll get it done on-chain.`,
    ];
    return prologue[Math.floor(Math.random() * prologue.length)];
  }

  async getOwnedAgents(chain: string, ownerAddress: string, collectionIds?: string[]) {
    const query: any = {
      chain,
      ownerAddress,
    };
    if (collectionIds && collectionIds.length > 0) {
      query.collectionId = { $in: collectionIds };
    }
    const ownedNfts = await this.mongoService.nftOwners.find(query).toArray();
  
    const nftIds = ownedNfts.map((nft) => `${nft.chain}:${nft.contractAddress}:${nft.tokenId}`);
    const agents = await this.mongoService.nfts.find({
      nftId: {
        $in: nftIds,
      }
    }).toArray();
    return agents;
  }

  async getAgentCoins(chain: string, tokens: string[]) {
    if (tokens.length === 0) {
      return [];
    }
    const agentCoins = await this.mongoService.agentCreatedCoins.find({
      chain,
      address: { $in: tokens },
    }).toArray();
    return agentCoins;
  }
}
