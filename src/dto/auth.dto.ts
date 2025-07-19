import { IsEmail, IsString, MinLength, IsMongoId, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterUserDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsMongoId()
  tenantId: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class LoginUserDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  password: string;

  @IsMongoId()
  tenantId: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class VerifyTokenDto {
  @IsString()
  token: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}

export class RegisterTenantDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsIn(['ecommerce', 'fintech', 'marketplace', 'saas'])
  businessType: string;

  constructor(data: any) {
    Object.assign(this, data);
  }
}