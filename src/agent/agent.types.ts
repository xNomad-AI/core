import { Character } from '@elizaos/core';
import { CharacterConfig } from '../shared/mongo/types.js';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  character: Character;
  characterConfig: CharacterConfig;
}
