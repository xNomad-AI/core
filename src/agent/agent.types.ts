import { Character } from '@everimbaq/core';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  character: Character;
  secrets?: { [key: string]: string };
  clients: string[];
}
