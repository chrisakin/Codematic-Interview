import { Document, Types } from 'mongoose';

// Base types
export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
export type PaymentProvider = 'paystack' | 'flutterwave' | 'stripe';
export type PaymentMethod = 'card' | 'bank_transfer' | 'mobile_money' | 'virtual_account' | 'wallet';
export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'refund';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type WebhookStatus = 'pending' | 'sent' | 'failed';

// User related interfaces
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

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | undefined;
  dateOfBirth?: Date | undefined;
  address?: IAddress | undefined;
  tenant: Types.ObjectId | ITenant;
  status: 'active' | 'suspended' | 'pending';
  kycStatus: 'pending' | 'verified' | 'rejected';
  kycData?: IKycData | undefined;
  lastLoginAt?: Date | undefined;
  loginAttempts: number;
  lockUntil?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  __v: number;

  // Virtual properties
  isLocked: boolean;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  toSafeJSON(): Partial<IUser>;
}

// Tenant related interfaces
export interface ITenantSettings {
  webhookUrl?: string;
  enabledProviders: PaymentProvider[];
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

export interface IProviderConfig {
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
}

export interface IProviderConfigs {
  paystack?: IProviderConfig;
  flutterwave?: IProviderConfig;
  stripe?: IProviderConfig;
}

export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  businessType: 'ecommerce' | 'fintech' | 'marketplace' | 'saas';
  status: 'active' | 'suspended' | 'pending';
  apiKey: string;
  secretKey: string;
  settings: ITenantSettings;
  providerConfigs: IProviderConfigs;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  isActive(): boolean;
  toSafeJSON(): Partial<ITenant>;
}

// Wallet related interfaces
export interface IWalletLimits {
  daily: {
    amount: number;
    used: number;
    lastReset: Date;
  };
  monthly: {
    amount: number;
    used: number;
    lastReset: Date;
  };
}

export interface IVirtualAccount {
  provider: PaymentProvider;
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

export interface IWallet extends Document {
  _id: Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
  __v: number;

  // Methods
  canTransact(amount: number): boolean;
  checkDailyLimit(amount: number): boolean;
  updateDailyUsage(amount: number): void;
  formatBalance(): IFormattedBalance;
}

// Transaction related interfaces
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

export interface ITransaction extends Document {
  _id: Types.ObjectId;
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
  fraudFlags?: string[];
  processedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  parentTransaction?: Types.ObjectId | ITransaction;
  createdAt: Date;
  updatedAt: Date;
  __v: number;

  // Virtual properties
  formattedAmount: IFormattedAmount;

  // Methods
  canBeProcessed(): boolean;
  markAsProcessing(): void;
  markAsCompleted(): void;
  markAsFailed(reason?: string): void;
  incrementWebhookAttempt(): void;
}

export interface ITransactionModel {
  generateReference(prefix?: string): string;
  findByReference(reference: string, tenant: Types.ObjectId): Promise<ITransaction | null>;
}

// Service interfaces
export interface ITransactionInitData {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  paymentMethod?: PaymentMethod;
  metadata?: any;
  idempotencyKey?: string;
}

export interface ITransactionUpdateData {
  status?: TransactionStatus;
  providerReference?: string;
  providerResponse?: any;
  metadata?: any;
}

export interface ITransactionFilters {
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId;
  status?: TransactionStatus;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
}

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

// Payment provider interfaces
export interface IPaymentInitData {
  amount: number;
  currency: string;
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
  currency: string;
  paidAt: string;
  channel: string;
  providerResponse: any;
}

export interface IPayoutData {
  amount: number;
  currency: string;
  reference: string;
  bankDetails: {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    routingNumber?: string;
    country?: string;
  };
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
  currency: string;
  customer: any;
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

export interface IPaymentProvider {
  initializePayment(data: IPaymentInitData): Promise<IPaymentInitResponse>;
  verifyPayment(reference: string): Promise<IPaymentVerificationResponse>;
  initiatePayout(data: IPayoutData): Promise<IPayoutResponse>;
  createVirtualAccount?(data: IVirtualAccountData): Promise<IVirtualAccountResponse>;
  verifyWebhook(payload: any, signature: string): Promise<boolean>;
  parseWebhookEvent(payload: any): IWebhookEvent;
  getBanks(): Promise<IBank[]>;
  resolveAccountNumber(accountNumber: string, bankCode: string): Promise<IAccountResolution>;
}

// Fraud detection interfaces
export interface IFraudCheckData {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  currency: Currency;
  type: TransactionType;
  paymentMethod?: PaymentMethod;
  metadata?: any;
}

export interface IRiskAssessment {
  score: number;
  flags: string[];
  shouldBlock: boolean;
  reason?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Job queue interfaces
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
  repeat?: {
    pattern: string;
  };
  jobId?: string;
}

// Notification interfaces
export interface INotificationData {
  to: string;
  subject?: string;
  message: string;
  template?: string;
  data?: any;
}

export interface INotificationResult {
  success: boolean;
  messageId?: string;
  message?: string;
  provider: string;
}

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

export interface ITransactionStats {
  pending: number;
  sent: number;
  failed: number;
  totalAttempts: number;
  successRate: string;
}