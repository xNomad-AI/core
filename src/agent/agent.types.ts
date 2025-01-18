import { Character } from '@elizaos/core';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  character: Character;
  agentSettings?: { [key: string]: string };
}
