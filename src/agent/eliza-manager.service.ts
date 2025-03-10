import { DirectClient } from '@elizaos/client-direct';
import {
  Character,
  Memory,
  ModelProviderName,
  stringToUuid,
} from '@elizaos/core';
import {
  AutoSwapTask,
  AutoSwapTaskTable,
  executeAutoTokenSwapTask,
} from '@elizaos/plugin-solana';
import { TEEMode } from '@elizaos/plugin-tee';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Timeout } from '@nestjs/schedule';
import { Keypair } from '@solana/web3.js';
import { newTradeAgentRuntime, startAgent } from '../eliza/starter/index.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { CharacterConfig } from '../shared/mongo/types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { sleep } from '../shared/utils.service.js';
import { WalletProxyService } from '../wallet/wallet-proxy.service.js';
import { SettingsService } from '../nft/core-settings.service.js';
import { NftConfigService } from '../nft/nft-config.service.js';
import { ClientName } from '../eliza/starter/clients/index.js';
import { TradeMonitorService } from '../shared/trade-monitor.service.js';

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
    private readonly tradeMonitorService: TradeMonitorService,
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
        this.logger.warn('No http proxy found for Twitter client', twitterUsername);
      } else {
        // should use the same proxy for the same user to provide a stable service
        await this.nftConfigService.updateNftTwitterHttpProxy(nftId, httpProxy);
        character.settings.secrets.TWITTER_HTTP_PROXY = httpProxy;
      }
    }
  }

  private async postStartAgent(character: Character, errors: Record<ClientName, any>, nftId?: string, ) {
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
      const { runtime, errors } = await startAgent(character, this.elizaClient, nftId, {
        mongoClient: this.mongoService.client,
      });
      if (errors['client-telegram'] || errors['client-twitter']) {
        this.logger.error(`nftId: ${nftId} start with errors : ${JSON.stringify(errors)}`);
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
    } else {
      return {
        status: 'running',
      };
    }
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
  ): Promise<{ solanaKeypair: Keypair }> {
    const secrectSalt = this.getAgentSecretSalt(chain, nftId);
    agentId ??= stringToUuid(nftId);

    const { keypair } = await this.walletProxyService.getWalletKey(
      secrectSalt,
      agentId,
      this.appConfig.get<string>('TEE_MODE') as TEEMode,
      true,
    );

    return {
      solanaKeypair: keypair,
    };
  }

  @Timeout(5000)
  async startAutoSwapTask() {
    while (true) {
      try {
        await this.runAutoSwapTask();
      } catch (error) {
        this.logger.error(`Error during auto swap task:, ${error}`);
      }
      await sleep(10000);
    }
  }

  async cancelCopyTrade(agentId: string, id: number){
    await this.tradeMonitorService.cancelCopyTrade(id);
    await this.mongoService.client.db('agent').collection('copyTrades').deleteOne({ agentId, id });
  }

  async updateCopyTradeStatus(agentId: string, id: number, status: string){
    await this.mongoService.client.db('agent').collection('copyTrades').updateOne({ agentId, id }, { $set: { status } });
  }

  async getCopyTrades(agentId: string){
    return await this.mongoService.client.db('agent').collection('copyTrades').find({ agentId }).toArray();
  }

  async runAutoSwapTask() {
    const memories = await this.mongoService.client
      .db('agent')
      .collection('memories')
      .find<Memory>({ type: AutoSwapTaskTable })
      .toArray();
    this.logger.log(`Running auto swap task for ${memories.length} tasks`);
    for (const memory of memories) {
      const { agentId } = memory as Memory;
      const { nftId, chain, aiAgent } = await this.mongoService.nfts.findOne({
        agentId,
      });
      if (!nftId) {
        continue;
      }
      const nftConfig = await this.mongoService.nftConfigs.findOne({
        nftId: nftId,
      });
      const character = await this.initAgentCharacter({
        nftId,
        chain,
        characterConfig: nftConfig?.characterConfig,
        character: aiAgent.character,
      });
      try {
        const runtime = await newTradeAgentRuntime(
          character,
          this.mongoService.client,
        );
        await executeAutoTokenSwapTask(runtime, memory);
      } catch (error) {
        this.logger.error(`Error during token swap:, ${error}`);
      }
    }
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
    character.settings['TEE_MODE'] = teeMode;
    character.settings['WALLET_SECRET_SALT'] = salt;
    character.settings['NFT_ID'] = nftId;
    if (
      character.modelProvider === 'deepseek' &&
      !character.settings['modelConfig']
    ) {
      character.settings['modelConfig'] = {
        max_response_length: 4096,
        maxInputTokens: 64000,
      };
    }
    character.settings.modelConfig = {
      ...character.settings.modelConfig,
      temperature: 0.2,
    };
    const { solana, evm } = await this.getAgentAccount(chain, nftId);
    character.knowledge = character.knowledge || [];
    character.knowledge.push(`
1. You are an AI Agent running in TEE with name: ${character.name}, generated by xNomad AI-NFT.
2. You support Solana token trading now, EVM support will be added soon, and other blockchains in the future.
3. You have multiple wallet addresses: Solana: ${solana}, EVM: ${evm}, it's public and can be shared with users.
`)

    character.system = `
# Task: You are a conversational agent assisting the user with various operations, including but not limited to Solana blockchain actions. Your goal is to identify the user's intent, determine if it matches any available actions.

# Instructions:
1. Identify whether the user's intent matches any registered action.
2. If an action is matched, ask for any missing parameters.
3. If all parameters are provided, return the function call in valid JSON format.
4. **If the user's input does not match any registered action, OR it contains general conversation topics (e.g., greetings, small talk, humor, identity questions), set \`action = "none"\` and generate a normal conversational reply.**
5. If a previous action is **unfinished**, but the new message is unrelated (i.e., normal conversation), **immediately reset action = "none"**.

# **Actions**:
`
    character.templates = character.templates || {};
    character.templates.messageHandlerTemplate =  ` 
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

  async getAgentAutotasks(agentId: string) {
    const memories = await this.mongoService.client
      .db('agent')
      .collection('memories')
      .find<Memory>({
        type: AutoSwapTaskTable,
        agentId,
      })
      .sort({ _id: -1 })
      .toArray();
    return memories.map((memory) => {
      let task: AutoSwapTask;
      if (typeof memory.content === 'string') {
        task = JSON.parse(memory.content)?.task as AutoSwapTask;
      } else {
        task = memory.content?.task as AutoSwapTask;
      }
      return {
        id: memory.id,
        userId: memory.userId,
        ...task,
      };
    });
  }

  async isAgentOwner(agentId: string, ownerAddress: string) {
    const nft = await this.mongoService.nfts.findOne({ agentId });
    const owner = await this.mongoService.nftOwners.findOne({
      chain: nft?.chain,
      contractAddress: nft?.contractAddress,
      tokenId: nft?.tokenId,
    });
    return owner?.ownerAddress === ownerAddress;
  }

  async ensure(agentId: string, ownerAddress: string) {
    if (!(await this.isAgentOwner(agentId, ownerAddress))) {
      throw new Error('You are not the owner of this Agent');
    }
  }
}
