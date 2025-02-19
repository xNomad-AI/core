// import { AutoClientInterface } from '@elizaos/client-auto';
// import { DiscordClientInterface } from '@elizaos/client-discord';
// import { TelegramClientInterface } from '@elizaos/client-telegram';
import { TwitterClientInterface } from '@elizaos/client-twitter';
import { Character, IAgentRuntime } from '@elizaos/core';
import TelegramClientInterface from '@elizaos/client-telegram';

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime,
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  // if (clientTypes.includes('auto')) {
  //   const autoClient = await AutoClientInterface.start(runtime);
  //   if (autoClient) clients.push(autoClient);
  // }

  // if (clientTypes.includes('discord')) {
  //   clients.push(await DiscordClientInterface.start(runtime));
  // }

  const isStartTg = process.env?.ENABLE_TELEGRAM_CLIENT === 'true';
  if (
    isStartTg &&
    (clientTypes.includes('telegram') ||
      character.settings?.secrets?.TELEGRAM_BOT_TOKEN)
  ) {
    try {
      console.log(`Starting Telegram client for ${character.name}`);
      const telegramClient = await TelegramClientInterface.start(runtime);
      if (telegramClient) clients.push(telegramClient);
    } catch (e) {
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
        const twitterClients = await TwitterClientInterface.start(runtime);
        clients.push(twitterClients);
      }
    } catch (e) {
      console.error(
        `Failed to start ${character.name} Twitter client: ${e.message}`,
      );
    }
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }

  return clients;
}
