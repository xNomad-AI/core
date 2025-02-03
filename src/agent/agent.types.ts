import { Character } from '@elizaos/core';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  character: Character;
  agentSettings: Record<string, any>;
}
