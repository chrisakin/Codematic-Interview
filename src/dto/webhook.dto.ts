import { IsOptional, IsString } from 'class-validator';

export class ReplayWebhookDto {
  @IsOptional()
  @IsString()
  event?: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}