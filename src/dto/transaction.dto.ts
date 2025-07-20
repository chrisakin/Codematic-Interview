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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeTransactionDto {
  @ApiProperty({
    description: 'Transaction type',
    example: 'deposit',
    enum: ['deposit', 'withdrawal', 'transfer']
  })
  @IsIn(['deposit', 'withdrawal', 'transfer'])
  type!: TransactionType;

  @ApiProperty({
    description: 'Transaction amount (in major currency unit)',
    example: 5000.00,
    minimum: 1
  })
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount!: number;

  @ApiProperty({
    description: 'Transaction currency',
    example: 'NGN',
    enum: ['NGN', 'USD', 'GBP', 'EUR']
  })
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  currency!: Currency;

  @ApiProperty({
    description: 'Transaction description',
    example: 'Wallet funding'
  })
  @IsString()
  @Transform(({ value }) => value?.trim())
  description!: string;

  @ApiPropertyOptional({
    description: 'Payment method',
    example: 'card',
    enum: ['card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet'],
    default: 'card'
  })
  @IsOptional()
  @IsIn(['card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet'])
  paymentMethod?: PaymentMethod = 'card';

  @ApiPropertyOptional({
    description: 'Payment provider',
    example: 'paystack',
    enum: ['paystack', 'flutterwave', 'stripe']
  })
  @IsOptional()
  @IsIn(['paystack', 'flutterwave', 'stripe'])
  provider?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { customerId: '12345' }
  })
  @IsOptional()
  @IsObject()
  metadata?: any;

  @ApiPropertyOptional({
    description: 'Idempotency key for duplicate prevention',
    example: 'unique-key-12345'
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetTransactionHistoryDto {
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
    description: 'Filter by transaction status',
    example: 'completed',
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled']
  })
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
  status?: TransactionStatus;

  @ApiPropertyOptional({
    description: 'Filter by transaction type',
    example: 'deposit',
    enum: ['deposit', 'withdrawal', 'transfer', 'fee', 'refund']
  })
  @IsOptional()
  @IsIn(['deposit', 'withdrawal', 'transfer', 'fee', 'refund'])
  type?: TransactionType;

  @ApiPropertyOptional({
    description: 'Start date for filtering (YYYY-MM-DD)',
    example: '2024-01-01',
    format: 'date'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering (YYYY-MM-DD)',
    example: '2024-12-31',
    format: 'date'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetTransactionStatsDto {
  @ApiPropertyOptional({
    description: 'Time period for statistics',
    example: 'month',
    enum: ['today', 'week', 'month', 'year'],
    default: 'month'
  })
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'year'])
  period?: string = 'month';

  constructor(data: any) {
    Object.assign(this, data);
  }
}