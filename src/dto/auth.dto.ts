import { IsEmail, IsString, MinLength, IsMongoId, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email'
  })
  @IsEmail()
  @Transform(({ value }: any) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    minLength: 8
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John'
  })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe'
  })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890'
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({
    description: 'Tenant ID',
    example: '507f1f77bcf86cd799439011'
  })
  @IsMongoId()
  tenantId: string;

  constructor(data: any) {
    this.email = '';
    this.password = '';
    this.firstName = '';
    this.lastName = '';
    this.tenantId = '';
    Object.assign(this, data);
  }
}

export class LoginUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email'
  })
  @IsEmail()
  @Transform(({ value }: any) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123'
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'Tenant ID',
    example: '507f1f77bcf86cd799439011'
  })
  @IsMongoId()
  tenantId: string;

  constructor(data: any) {
    this.email = '';
    this.password = '';
    this.tenantId = '';
    Object.assign(this, data);
  }
}

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password',
    example: 'oldpassword123'
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'New password',
    example: 'newpassword123',
    minLength: 8
  })
  @IsString()
  @MinLength(8)
  newPassword: string;

  constructor(data: any) {
    this.currentPassword = '';
    this.newPassword = '';
    Object.assign(this, data);
  }
}

export class VerifyTokenDto {
  @ApiProperty({
    description: 'JWT token to verify',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString()
  token: string;

  constructor(data: any) {
    this.token = '';
    Object.assign(this, data);
  }
}

export class RegisterTenantDto {
  @ApiProperty({
    description: 'Business name',
    example: 'My Business'
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'Business email address',
    example: 'business@example.com',
    format: 'email'
  })
  @IsEmail()
  @Transform(({ value }: any) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'Type of business',
    example: 'ecommerce',
    enum: ['ecommerce', 'fintech', 'marketplace', 'saas']
  })
  @IsIn(['ecommerce', 'fintech', 'marketplace', 'saas'])
  businessType: string;

  constructor(data: any) {
    this.name = '';
    this.email = '';
    this.businessType = '';
    Object.assign(this, data);
  }
}