import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class GetAgentBindingSocietyInfoResponseDto {
  @ApiProperty({
    description: 'nftid in xnomad',
    example: 'solana:xx:xx',
  })
  @IsString()
  @IsNotEmpty()
  nftId: string;

  @ApiProperty({
    description: 'the blockchain of nft',
    example: 'solana',
  })
  @IsString()
  @IsNotEmpty()
  chain: string;

  @ApiProperty({
    description: 'twitter username without @',
    example: 'xxx',
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  twitterUsername: string;

  @ApiProperty({
    description: 'telegram bot username without @',
    example: 'xxx_bot',
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  telegramBotUsername: string;
}
