import { settings } from '@elizaos/core';

export function getRuntimeKey(runtime: any, key: string) {
  return runtime.getSetting(key) || process.env[key] || settings[key];
}
