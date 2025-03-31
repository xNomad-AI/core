import { IDatabaseAdapter } from "@elizaos/core";
import { TradeSettingsDto } from "./type.js";
import { isValidAddress } from "./tokenUtils.js";

const DEFAULT_CONFIG = {
    EVM_SWAP_FEE_ACCOUNT: '0x1b455ab558518b7c32bafaff4661ede24cef005c',
    EVM_SWAP_FEE_BPS: 100,
};

export function getSWAP_FEE_BPS() {
    return DEFAULT_CONFIG.EVM_SWAP_FEE_BPS;
}

export function getSWAP_FEE_ACCOUNT() {
    return DEFAULT_CONFIG.EVM_SWAP_FEE_ACCOUNT;
}

export async function getTradeSettings(agentId: string, chain: string): Promise<TradeSettingsDto> {
    const result = await fetch(`http://localhost:8080/agent/trade/settings?agentId=${agentId}&chain=${chain}`);
    return await result.json() as TradeSettingsDto;
}

// if input or output token is agent created token, return the creator address and platform fee rate 50%
// if input or output token is not agent created token, return the platform fee rate 1%
export async function getSwapTokenFees(
    databaseAdapter: IDatabaseAdapter,
    chain: string,
    inputTokenCA: string,
    outputTokenCA: string,
  ) {
    const creator = await getAgentTokenCreator(databaseAdapter, chain, inputTokenCA, outputTokenCA);
    if (creator && isValidAddress(creator)) {
      return [{
        feeCollector: getSWAP_FEE_ACCOUNT(),
        feeRate: '50',
      }, {
        feeCollector: creator,
        feeRate: '50',
      }];
    }
    return [{
      feeCollector: getSWAP_FEE_ACCOUNT(),
      feeRate: getSWAP_FEE_BPS().toString(),
    }];
  }
  
  export async function getAgentTokenCreator(
    databaseAdapter: IDatabaseAdapter,
    chain: string,
    inputTokenCA: string,
    outputTokenCA: string,
  ) {
    const coin = await databaseAdapter.db.db('core').collection('AgentCreatedCoin').findOne({
      address: { $in: [inputTokenCA.toLowerCase(), outputTokenCA.toLowerCase()] },
      chain: chain,
    });
    return coin?.creatorAddress?.toLowerCase();
  }