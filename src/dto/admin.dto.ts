import { IsIn, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RetryFailedJobsDto {
  @IsIn(['transaction', 'webhook', 'notification'])
  queue!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class CleanQueueDto {
  @IsIn(['transaction', 'webhook', 'notification'])
  queue!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  olderThan?: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetTopUsersDto {
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'year'])
  period?: string = 'month';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetTransactionTrendsDto {
  @IsOptional()
  @IsIn(['week', 'month', 'year'])
  period?: string = 'month';

  @IsOptional()
  @IsIn(['hour', 'day', 'month'])
  groupBy?: string = 'day';

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class GetFraudAnalyticsDto {
  @IsOptional()
  @IsIn(['week', 'month', 'year'])
  period?: string = 'month';

  constructor(data: any) {
    Object.assign(this, data);
  }
}