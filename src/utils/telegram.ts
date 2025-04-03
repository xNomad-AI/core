import { Telegraf } from 'telegraf';

import { defaultLogger } from '../settings.js';

export async function getBotUsername(token: string, ignoreError: boolean = false): Promise<string | undefined> {
  try {
    const bot = new Telegraf(token);
    const botInfo = await bot.telegram.getMe();
    return botInfo.username;
  } catch (error) {
    if (!ignoreError) {
      throw new Error(`Failed to get bot ID: ${error.message}`);
    } else {
      defaultLogger.warn(`${token} Failed to get bot ID: ${error.message}`);
    }
  }
}
