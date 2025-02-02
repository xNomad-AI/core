import { Character } from '@everimbaq/core';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  character: Character;
  agentSettings: Record<string, any>;
}
