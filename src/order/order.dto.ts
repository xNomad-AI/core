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
  @IsNotEmpty()
  price: number;

  @IsOptional()
  @IsString()
  sellerReferralAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expiry?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityFee?: number;
}

export class BidNFTDto {
  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @IsOptional()
  @IsString()
  buyerReferralAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expiry?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityFee?: number;
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


export class AcceptOfferDto {
  @IsString()
  @IsNotEmpty()
  buyerAddress: string;

  @IsString()
  @IsNotEmpty()
  sellerAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenATAAddress: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  newPrice: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  sellerExpiry: number;

  @IsOptional()
  @IsString()
  buyerReferralAddress?: string;

  @IsOptional()
  @IsString()
  sellerReferralAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyerExpiry?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityFee?: number;
}

export class CancelListingDto {
  @IsString()
  @IsNotEmpty()
  sellerAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenAccountAddress: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expiry?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityFee?: number;

  @IsOptional()
  @IsString()
  sellerReferralAddress?: string;
}


// core/src/order/order.dto.ts
export class CancelOfferDto {
  @IsString()
  @IsNotEmpty()
  buyerAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenMintAddress: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expiry?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorityFee?: number;

  @IsOptional()
  @IsString()
  buyerReferralAddress?: string;
}