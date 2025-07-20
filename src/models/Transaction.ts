import { Schema, model } from 'mongoose';
import mongoose from 'mongoose';
import { ITransaction, ITransactionFees, IFormattedAmount, TransactionType, TransactionStatus, Currency, PaymentProvider, PaymentMethod, WebhookStatus, ITransactionModel } from '@/types';
import { Types } from 'mongoose';

const transactionSchema = new Schema<ITransaction>({
  reference: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    required: true,
    enum: ['deposit', 'withdrawal', 'transfer', 'fee', 'refund']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  currency: {
    type: String,
    required: true,
    enum: ['NGN', 'USD', 'GBP', 'EUR']
  },
  description: {
    type: String,
    required: true,
    maxlength: 255
  },
  
  // Wallet references for different transaction types
  sourceWallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet'
  },
  destinationWallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet'
  },
  
  // Provider information
  provider: {
    type: String,
    enum: ['paystack', 'flutterwave', 'stripe', 'internal']
  },
  providerReference: String,
  providerResponse: Schema.Types.Mixed,
  
  // Payment method details
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet']
  },
  paymentDetails: Schema.Types.Mixed,
  
  // Fees and charges
  fees: {
    platform: { type: Number, default: 0 },
    provider: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Metadata and tracking
  metadata: Schema.Types.Mixed,
  clientIp: String,
  userAgent: String,
  
  // Idempotency
  idempotencyKey: {
    type: String,
    sparse: true,
    index: true
  },
  
  // Webhook and notification status
  webhookStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  webhookAttempts: {
    type: Number,
    default: 0
  },
  webhookLastAttempt: Date,
  
  // Fraud detection
  riskScore: {
    type: Number,
    min: 0,
    max: 100
  },
  fraudFlags: [String],
  
  // Timing
  processedAt: Date,
  failedAt: Date,
  cancelledAt: Date,
  
  // Parent transaction for refunds/reversals
  parentTransaction: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
transactionSchema.index({ tenant: 1, createdAt: -1 });
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ tenant: 1, type: 1, status: 1 });
transactionSchema.index({ tenant: 1, reference: 1 }, { unique: true });
transactionSchema.index({ providerReference: 1, provider: 1 });
transactionSchema.index({ idempotencyKey: 1, tenant: 1 }, { unique: true, sparse: true });
transactionSchema.index({ webhookStatus: 1, webhookAttempts: 1 });
transactionSchema.index({ status: 1, createdAt: 1 });

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function(this: ITransaction): IFormattedAmount {
  return {
    amount: this.amount / 100,
    currency: this.currency,
    formatted: `${this.currency} ${(this.amount / 100).toFixed(2)}`
  };
});

// Methods
transactionSchema.methods.canBeProcessed = function(this: ITransaction): boolean {
  return this.status === 'pending';
};

transactionSchema.methods.markAsProcessing = function(this: ITransaction): void {
  this.status = 'processing';
  this.processedAt = new Date();
};

transactionSchema.methods.markAsCompleted = function(this: ITransaction): void {
  this.status = 'completed';
  this.processedAt = new Date();
};

transactionSchema.methods.markAsFailed = function(this: ITransaction, reason?: string): void {
  this.status = 'failed';
  this.failedAt = new Date();
  if (reason) {
    this.metadata = { ...this.metadata, failureReason: reason };
  }
};

transactionSchema.methods.incrementWebhookAttempt = function(this: ITransaction): void {
  this.webhookAttempts += 1;
  this.webhookLastAttempt = new Date();
  
  if (this.webhookAttempts >= 5) {
    this.webhookStatus = 'failed';
  }
};

// Static methods
transactionSchema.statics.generateReference = function(prefix: string = 'TXN'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
};

transactionSchema.statics.findByReference = function(reference: string, tenant: Types.ObjectId): Promise<ITransaction | null> {
  return this.findOne({ reference, tenant });
};

interface ITransactionDocument extends ITransaction {}
interface ITransactionModelType extends mongoose.Model<ITransactionDocument>, ITransactionModel {}

const TransactionModel = model<ITransactionDocument, ITransactionModelType>('Transaction', transactionSchema);
export default TransactionModel;