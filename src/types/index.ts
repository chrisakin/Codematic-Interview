import { Document, Types } from 'mongoose';
import { Request } from 'express';

// Base interfaces
export interface ITimestamps {
  createdAt: Date;
  updatedAt: Date;
}

// Tenant interfaces
export interface ITenant extends Document, ITimestamps {
  name: string;
  email: string;
  businessType: 'ecommerce' | 'fintech' | 'marketplace' | 'saas';
  status: 'active' | 'suspended' | 'pending';
  apiKey: string;
  secretKey: string;
  settings: ITenantSettings;
  providerConfigs: IProviderConfigs;
  isActive(): boolean;
  toSafeJSON(): Partial<ITenant>;
}

export interface ITenantSettings {
  webhookUrl?: string;
  enabledProviders: Array<'paystack' | 'flutterwave' | 'stripe'>;
  rateLimit: {
    requests: number;
    windowMs: number;
  };
  fraudDetection: {
    enabled: boolean;
    maxTransactionAmount: number;
    dailyTransactionLimit: number;
  };
}

export interface IProviderConfigs {
  paystack?: IProviderConfig;
  flutterwave?: IProviderConfig;
  stripe?: IProviderConfig;
}

export interface IProviderConfig {
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
}

// User interfaces
export interface IUser extends Document, ITimestamps {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  address?: IAddress;
  tenant: Types.ObjectId | ITenant;
  status: 'active' | 'suspended' | 'pending';
  kycStatus: 'pending' | 'verified' | 'rejected';
  kycData?: IKycData;
  lastLoginAt?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  isLocked: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
  toSafeJSON(): Partial<IUser>;
}

export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
}

export interface IKycData {
  documentType?: string;
  documentNumber?: string;
  verifiedAt?: Date;
}

// Wallet interfaces
export interface IWallet extends Document, ITimestamps {
  user: Types.ObjectId | IUser;
  tenant: Types.ObjectId | ITenant;
  currency: Currency;
  balance: number;
  ledgerBalance: number;
  status: 'active' | 'suspended' | 'frozen';
  limits: IWalletLimits;
  virtualAccounts: IVirtualAccount[];
  lastTransactionAt?: Date;
  version: number;
  canTransact(amount: number): boolean;
  checkDailyLimit(amount: number): boolean;
  updateDailyUsage(amount: number): void;
  formatBalance(): IFormattedBalance;
}

export interface IWalletLimits {
  daily: ILimit;
  monthly: ILimit;
}

export interface ILimit {
  amount: number;
  used: number;
  lastReset: Date;
}

export interface IVirtualAccount {
  provider: 'paystack' | 'flutterwave';
  accountNumber: string;
  bankName: string;
  accountName: string;
  isActive: boolean;
  createdAt: Date;
}

export interface IFormattedBalance {
  balance: number;
  ledgerBalance: number;
  currency: Currency;
}

// Transaction interfaces
export interface ITransaction extends Document, ITimestamps {
  reference: string;
  tenant: Types.ObjectId | ITenant;
  user?: Types.ObjectId | IUser;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  description: string;
  sourceWallet?: Types.ObjectId | IWallet;
  destinationWallet?: Types.ObjectId | IWallet;
  provider?: PaymentProvider;
  providerReference?: string;
  providerResponse?: any;
  paymentMethod?: PaymentMethod;
  paymentDetails?: any;
  fees: ITransactionFees;
  metadata?: any;
  clientIp?: string;
  userAgent?: string;
  idempotencyKey?: string;
  webhookStatus: WebhookStatus;
  webhookAttempts: number;
  webhookLastAttempt?: Date;
  riskScore?: number;
  fraudFlags: string[];
  processedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  parentTransaction?: Types.ObjectId | ITransaction;
  formattedAmount: IFormattedAmount;
  canBeProcessed(): boolean;
  markAsProcessing(): void;
  markAsCompleted(): void;
  markAsFailed(reason?: string): void;
  incrementWebhookAttempt(): void;
}

export interface ITransactionFees {
  platform: number;
  provider: number;
  total: number;
}

export interface IFormattedAmount {
  amount: number;
  currency: Currency;
  formatted: string;
}

// Enums and types
export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'refund';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type PaymentProvider = 'paystack' | 'flutterwave' | 'stripe' | 'internal';
export type PaymentMethod = 'card' | 'bank_transfer' | 'mobile_money' | 'virtual_account' | 'wallet';
export type WebhookStatus = 'pending' | 'sent' | 'failed';

// Service interfaces
export interface IPaymentProvider {
  initializePayment(data: IPaymentInitData): Promise<IPaymentInitResponse>;
  verifyPayment(reference: string): Promise<IPaymentVerificationResponse>;
  initiatePayout(data: IPayoutData): Promise<IPayoutResponse>;
  createVirtualAccount?(data: IVirtualAccountData): Promise<IVirtualAccountResponse>;
  verifyWebhook(payload: any, signature: string): Promise<boolean>;
  parseWebhookEvent(payload: any): IWebhookEvent;
  getBanks?(): Promise<IBank[]>;
  resolveAccountNumber?(accountNumber: string, bankCode: string): Promise<IAccountResolution>;
}

export interface IPaymentInitData {
  amount: number;
  currency: Currency;
  reference: string;
  email: string;
  metadata?: any;
}

export interface IPaymentInitResponse {
  reference: string;
  authorizationUrl: string;
  accessCode?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  provider: PaymentProvider;
  providerResponse: any;
}

export interface IPaymentVerificationResponse {
  reference: string;
  status: 'completed' | 'failed';
  amount: number;
  currency: Currency;
  paidAt: string | number;
  channel: string;
  providerResponse: any;
}

export interface IPayoutData {
  amount: number;
  currency: Currency;
  reference: string;
  bankDetails: IBankDetails;
}

export interface IPayoutResponse {
  reference: string;
  status: string;
  transferId?: string;
  provider: PaymentProvider;
  providerResponse: any;
}

export interface IVirtualAccountData {
  customerId?: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  preferredBank?: string;
  bvn?: string;
}

export interface IVirtualAccountResponse {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode?: string;
  provider: PaymentProvider;
  providerResponse: any;
}

export interface IWebhookEvent {
  event: string;
  reference: string;
  status: 'success' | 'failed' | 'pending';
  amount: number;
  currency: Currency;
  customer?: any;
  providerData: any;
}

export interface IBank {
  name: string;
  code: string;
  slug?: string;
  provider: PaymentProvider;
}

export interface IAccountResolution {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

export interface IBankDetails {
  accountName: string;
  accountNumber: string;
  bankCode: string;
  routingNumber?: string;
  country?: string;
}

// Request interfaces
export interface IAuthenticatedRequest extends Request {
  user: IUser;
  tenant: ITenant;
  transaction?: ITransaction;
  webhookSignature?: string;
  webhookTimestamp?: string;
}

export interface ITransactionInitData {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  paymentMethod: PaymentMethod;
  metadata?: any;
  idempotencyKey?: string;
}

export interface IRiskAssessment {
  score: number;
  flags: string[];
  shouldBlock: boolean;
  reason?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface IFraudCheckData {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  currency: Currency;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  metadata?: any;
}

// Pagination and filtering
export interface IPaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
}

export interface IPaginationResult<T> {
  data: T[];
  pagination: {
    current: number;
    pages: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ITransactionFilters {
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId;
  status?: TransactionStatus;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
}

// Job interfaces
export interface IJobData {
  [key: string]: any;
}

export interface IJobOptions {
  delay?: number;
  attempts?: number;
  backoff?: {
    type: string;
    delay: number;
  };
  removeOnComplete?: number;
  removeOnFail?: number;
  jobId?: string;
}

// Configuration interfaces
export interface IAppConfig {
  port: number;
  nodeEnv: string;
  mongoUri: string;
  redisUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  allowedOrigins: string[];
}

export interface IProviderCredentials {
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
}

// Error interfaces
export interface IErrorResponse {
  status: string;
  message: string;
  type?: string;
  timestamp: string;
  path?: string;
  field?: string;
  provider?: string;
  details?: any;
  riskScore?: number;
  stack?: string;
}

// Notification interfaces
export interface INotificationData {
  to: string;
  subject?: string;
  template?: string;
  data?: any;
  userId?: Types.ObjectId;
  title?: string;
  body?: string;
  channel?: string;
  level?: 'info' | 'warning' | 'error' | 'success';
}

export interface INotificationResult {
  success: boolean;
  messageId?: string;
  provider: string;
  message?: string;
}

// Webhook interfaces
export interface IWebhookPayload {
  event: string;
  data: {
    id: Types.ObjectId;
    reference: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    currency: Currency;
    description: string;
    user: {
      id: Types.ObjectId;
      email: string;
      firstName: string;
      lastName: string;
    };
    metadata?: any;
    createdAt: Date;
    updatedAt: Date;
    processedAt?: Date;
  };
  timestamp: number;
}

// Cache interfaces
export interface ICacheOptions {
  ttl?: number;
  prefix?: string;
}

export interface ILockOptions {
  ttl?: number;
  retries?: number;
  delay?: number;
}

// Statistics interfaces
export interface ITransactionStats {
  pending: number;
  sent: number;
  failed: number;
  totalAttempts: number;
  successRate: string;
}

export interface IQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;