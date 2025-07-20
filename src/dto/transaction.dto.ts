import { 
  IsIn, 
  IsNumber, 
  IsString, 
  IsOptional, 
  Min, 
  IsInt, 
  IsObject,
  IsDateString 
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Currency, TransactionType, PaymentMethod, TransactionStatus } from '@/types';

export class InitializeTransactionDto {
  @IsIn(['deposit', 'withdrawal', 'transfer'])
  type!: TransactionType;

  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount!: number;

  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  currency!: Currency;

  @IsString()
  @Transform(({ value }) => value?.trim())
  description!: string;

  @IsOptional()
  @IsIn(['card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet'])
  paymentMethod?: PaymentMethod = 'card';

  @IsOptional()
  @IsIn(['paystack', 'flutterwave', 'stripe'])
  provider?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetTransactionHistoryDto {
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
  @IsIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
  status?: TransactionStatus;

  @IsOptional()
  @IsIn(['deposit', 'withdrawal', 'transfer', 'fee', 'refund'])
  type?: TransactionType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetTransactionStatsDto {
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'year'])
  period?: string = 'month';

  constructor(data: any) {
    Object.assign(this, data);
  }
}