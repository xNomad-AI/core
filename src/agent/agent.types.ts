import { BadRequestException } from '@nestjs/common';

export class CreateAgentDto {
  chain: string;
  nftId: string;
  restart?: boolean;
}

export class TradeSettingsDTO {
  slippage: number;
  priorityFee: number;
  tip: number;
  mode: 'FAST' | 'ANTI_MEV';
}

export function validateTradeSettings(dto: TradeSettingsDTO) {
  if (!dto.slippage || dto.slippage < 0 || dto.slippage > 1) {
    throw new BadRequestException('Invalid slippage, slippage should be between 0 and 1');
  }

  if (dto.tip < 0.001) {
    throw new BadRequestException('Invalid tip, tip should be greater than 0.001 SOL');
  }

  if (dto.mode === 'ANTI_MEV' && dto.priorityFee < 0.018) {
    throw new BadRequestException(
      'In ANTI_MEV mode, priority fee should be greater than 0.018 SOL',
    );
  }
}