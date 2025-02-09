import { DirectClient } from '@elizaos/client-direct';
import {
  elizaLogger,
  stringToUuid,
  type Character,
  AgentRuntime,
  ICacheManager,
  IDatabaseAdapter,
} from '@elizaos/core';
import path from 'path';
import { initializeDbCache } from './cache/index.js';
import { initializeClients } from './clients/index.js';
import { getTokenForProvider } from './config/index.js';
import { initializeDatabase } from './database/index.js';
import { TEEMode, teePlugin } from '@elizaos/plugin-tee';
import { solanaPlugin, startAutoSwapTask } from '@elizaos/plugin-solana';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';
import { createNodePlugin } from '@elizaos/plugin-node';
import { MongoClient } from 'mongodb';

let nodePlugin: any | undefined;

function getSecret(character: Character, secret: string) {
  return character.settings?.secrets?.[secret] || process.env[secret];
}

export async function createAgent(
  character: Character,
  db: IDatabaseAdapter,
  cache: ICacheManager,
  token: string,
): Promise<AgentRuntime> {
  elizaLogger.info(
    elizaLogger.successesTitle,
    'Creating runtime for character',
    character.name,
  );

  nodePlugin ??= createNodePlugin();

  const teeMode = getSecret(character, 'TEE_MODE') || 'OFF';
  const walletSecretSalt = getSecret(character, 'WALLET_SECRET_SALT');

  // Validate TEE configuration
  if (teeMode !== TEEMode.OFF && !walletSecretSalt) {
    elizaLogger.error('WALLET_SECRET_SALT required when TEE_MODE is enabled');
    throw new Error('Invalid TEE configuration');
  }

  const runtime = new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider,
    evaluators: [],
    character,
    plugins: [
      bootstrapPlugin,
      // nodePlugin,
      solanaPlugin,
      teePlugin,
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  });
  startAutoSwapTask(runtime);
  return runtime;
}

export async function startAgent(
  character: Character,
  directClient: DirectClient,
  nftId: string,
  options?: {
    mongoClient?: MongoClient;
  }
) {
  try {
    character.id ??= stringToUuid(nftId || character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const db = initializeDatabase(options.mongoClient, `agent`);

    await db.init();

    const cache = initializeDbCache(character, db);
    const runtime = await createAgent(character, db, cache, token);

    await runtime.initialize();

    runtime.clients = await initializeClients(character, runtime);

    directClient.registerAgent(runtime);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error,
    );
  }
}
