import { Character, IAgentRuntime } from '@elizaos/core';
import TelegramClientInterface from '@elizaos/client-telegram';
import { TwitterClientStarter } from '@xnomad/task-manager';

export type ClientName = 'client-telegram' | 'client-twitter';

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime,
  nftId: string,
) {
  const clients: Record<string, any> = [];
  const errors: Record<ClientName, any> = {
    'client-telegram': null,
    'client-twitter': null,
  };

  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  const isStartTg = process.env?.ENABLE_TELEGRAM_CLIENT === 'true';
  if (
    isStartTg &&
    (clientTypes.includes('telegram') ||
      character.settings?.secrets?.TELEGRAM_BOT_TOKEN)
  ) {
    try {
      const isSuspended =
        character.settings?.secrets?.TELEGRAM_LOGIN_SUSPEND == 'true';
      if (isSuspended) {
        console.log(`Suspended Telegram client for ${character.name}`);
      } else {
        console.log(`Starting Telegram client for ${character.name}`);
        const telegramClient = await TelegramClientInterface.start(runtime);
        if (telegramClient) clients['client-telegram'] = telegramClient;
      }
    } catch (e) {
      errors['client-telegram'] = e;
      console.error(
        `Failed to start ${character.name} Telegram client: ${e.message}`,
      );
    }
  }

  const isStartTwitter = process.env?.ENABLE_TWITTER_CLIENT === 'true';
  if (
    isStartTwitter &&
    character.settings?.secrets?.TWITTER_PASSWORD &&
    character.settings?.secrets?.TWITTER_2FA_SECRET
  ) {
    try {
      const isSuspended =
        character.settings?.secrets?.TWITTER_LOGIN_SUSPEND == 'true';
      if (isSuspended) {
        console.log(`Suspended Twitter client for ${character.name}`);
      } else {
        console.log(`Starting Twitter client for ${character.name}`);
        const client = new TwitterClientStarter(nftId);
        await client.start(runtime);
        clients['client-twitter'] = client;
      }
    } catch (e) {
      errors['client-twitter'] = e.message;
      console.error(
        `Failed to start ${character.name} Twitter client: ${e.message}`,
      );
    }
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          const _client = await client.start(runtime);
          clients[client.toString()] = _client;
        }
      }
    }
  }

  return { clients, errors };
}
