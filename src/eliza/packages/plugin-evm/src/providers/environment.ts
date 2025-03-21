import { settings } from '@elizaos/core';

export function getRuntimeKey(runtime: any, key: string) {
  return runtime.getSetting(key) || process.env[key] || settings[key];
}

// convert null strings to null
export function convertNullStrings(obj) {
  for (const key in obj) {
    if (obj[key] === 'null') {
      obj[key] = null;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertNullStrings(obj[key]);
    }
  }
  return obj;
}

export function trimTokenSymbol(tokenSymbol: string) {
  if (tokenSymbol.startsWith('$$')) {
    return tokenSymbol.slice(1);
  }
  return tokenSymbol;
}