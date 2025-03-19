import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { OrderType } from './order.types.js';

export class ListNFTDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenAccountAddress: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class BuyNFTDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenAccountAddress: string;

  @IsString()
  @IsNotEmpty()
  sellerAddress: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class MakeOfferDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class AcceptOfferDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenAccountAddress: string;

  @IsString()
  @IsNotEmpty()
  buyerAddress: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CancelListingDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenAccountAddress: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CancelOfferDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class GetOrdersDto {
  @IsString()
  @IsNotEmpty()
  nftId: string;

  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class GetNFTListingsDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;
}

export class GetNFTOffersDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;
} 