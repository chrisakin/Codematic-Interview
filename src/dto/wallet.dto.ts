import { IsIn, IsNumber, IsString, IsOptional, Min, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Currency } from '@/types';

export class CreateWalletDto {
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  currency: Currency;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class FundWalletDto {
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @IsString()
  @Transform(({ value }) => value?.trim())
  description: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class TransferBetweenWalletsDto {
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  fromCurrency: Currency;

  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  toCurrency: Currency;

  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @IsString()
  @Transform(({ value }) => value?.trim())
  description: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetWalletTransactionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['deposit', 'withdrawal', 'transfer'])
  type?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}