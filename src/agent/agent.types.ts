import { BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';
import { TradeSettingsSolana, TradeSettingsEvm } from 'src/shared/mongo/types';
export class CreateAgentDto {
  chain: string;
  nftId: string;
  restart?: boolean;
}

export interface SolanaTradeSettingsDTO extends TradeSettingsSolana {}

export interface EvmTradeSettingsDTO extends TradeSettingsEvm {}

export interface TestTweetDto {
  twitterUsername: string;
  maxTweetLength: number;
  twitterPostTemplate: string;
}

export function validateTradeSettingsSolana(dto: SolanaTradeSettingsDTO) {
  if (!dto.slippage || dto.slippage < 0 || dto.slippage > 1) {
    throw new BadRequestException('Invalid slippage, slippage should be between 0 and 1');
  }

  if (dto.mode === 'ANTI_MEV' && dto.priorityFee < 0.018) {
    throw new BadRequestException(
      'In ANTI_MEV mode, priority fee should be greater than 0.018 SOL',
    );
  }
}

export function validateTradeSettingsEvm(dto: EvmTradeSettingsDTO) {
  if (!dto.slippage || dto.slippage < 0 || dto.slippage > 1) {
    throw new BadRequestException('Invalid slippage, slippage should be between 0 and 1');
  }

  if (dto.chain === 'bsc') {
    if (dto.mode === 'ANTI_MEV' && (dto.tip < ethers.parseEther('0.00001') || !Number.isInteger(dto.tip))){
      throw new BadRequestException('Tip should be an integer greater than 0.00001 native token');
    }
    if (dto.gasMode === 'CUSTOM' && (!dto.maxFeePerGas || !Number.isFinite(dto.maxFeePerGas))){
      throw new BadRequestException('Gas must be set when gas mode is set to custom');
    }
  }
}