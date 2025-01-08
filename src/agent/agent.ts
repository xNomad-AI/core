import { Character } from '@ai16z/eliza';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  character: Character;
}
