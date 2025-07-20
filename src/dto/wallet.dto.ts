import { IsIn, IsNumber, IsString, IsOptional, Min, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Currency } from '@/types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWalletDto {
  @ApiProperty({
    description: 'Wallet currency',
    example: 'NGN',
    enum: ['NGN', 'USD', 'GBP', 'EUR']
  })
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  currency!: Currency;

  constructor(data: any) {
    this.currency = 'NGN'; // Default value
    Object.assign(this, data);
  }
}

export class FundWalletDto {
  @ApiProperty({
    description: 'Amount to fund (in major currency unit)',
    example: 1000.50,
    minimum: 1
  })
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount!: number;

  @ApiProperty({
    description: 'Description for the funding',
    example: 'Wallet funding'
  })
  @IsString()
  @Transform(({ value }) => value?.trim())
  description!: string;

  constructor(data: any) {
    this.amount = 0;
    this.description = '';
    Object.assign(this, data);
  }
}

export class TransferBetweenWalletsDto {
  @ApiProperty({
    description: 'Source wallet currency',
    example: 'NGN',
    enum: ['NGN', 'USD', 'GBP', 'EUR']
  })
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  fromCurrency!: Currency;

  @ApiProperty({
    description: 'Destination wallet currency',
    example: 'USD',
    enum: ['NGN', 'USD', 'GBP', 'EUR']
  })
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  toCurrency!: Currency;

  @ApiProperty({
    description: 'Amount to transfer (in major currency unit)',
    example: 100.00,
    minimum: 1
  })
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount!: number;

  @ApiProperty({
    description: 'Description for the transfer',
    example: 'Currency exchange'
  })
  @IsString()
  @Transform(({ value }) => value?.trim())
  description!: string;

  constructor(data: any) {
    this.fromCurrency = 'NGN';
    this.toCurrency = 'NGN';
    this.amount = 0;
    this.description = '';
    Object.assign(this, data);
  }
}

export class GetWalletTransactionsDto {
  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    minimum: 1,
    default: 1
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    default: 20
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by transaction type',
    example: 'deposit',
    enum: ['deposit', 'withdrawal', 'transfer']
  })
  @IsOptional()
  @IsIn(['deposit', 'withdrawal', 'transfer'])
  type?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}