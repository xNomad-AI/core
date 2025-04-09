import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class TestTweetDto {
  @ApiProperty({
    description: 'prompt template for the tweet',
    example: 'hello world',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  twitterPostTemplate: string;

  @ApiProperty({
    description: 'twitter username without @',
    example: 'debugTwitterName',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  twitterUsername: string;

  @ApiProperty({
    description: 'max tweet length',
    example: 200,
    required: true,
  })
  @IsInt()
  @Min(10)
  @Max(200)
  @IsNotEmpty()
  maxTweetLength: number;
}

export class TestTweetResponseDto {
  @ApiProperty({
    description: 'generated tweet',
    example: 'hello world',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  tweet: string;
}
