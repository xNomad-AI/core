import { IAgentRuntime, settings } from '@elizaos/core';
import { EVMClient } from './evmClient.js';
import { createHash } from 'crypto';

export function getRuntimeKey(runtime: IAgentRuntime, key: string) {
  return runtime.getSetting(key) || process.env[key] || settings[key];
}

export function getRuntimeDefaultChain(runtime: IAgentRuntime){
  return runtime.getSetting('NFT_CHAIN');
}

export function getEvmClient(runtime: IAgentRuntime, chain?: string){
  chain = chain || getRuntimeDefaultChain(runtime);
  const rpcUrl = getChainRPC(runtime, chain);
  return new EVMClient({ rpcUrl, chainName: chain });
}

export function getChainRPC(runtime: IAgentRuntime, chain?: string){
  chain = chain || getRuntimeDefaultChain(runtime);
  const key = `${chain.toUpperCase()}_RPC_URL`;
  return runtime.getSetting(key) || process.env[key] || settings[key];
}

export function md5sum(str: string){
  return createHash('md5').update(str).digest('hex');
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