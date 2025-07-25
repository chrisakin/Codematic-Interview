import { Schema, model } from 'mongoose';
import { IWallet, IWalletLimits, IVirtualAccount, IFormattedBalance, Currency } from '@/types';

const walletSchema = new Schema<IWallet>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  currency: {
    type: String,
    required: true,
    enum: ['NGN', 'USD', 'GBP', 'EUR'],
    default: 'NGN'
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  ledgerBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'frozen'],
    default: 'active'
  },
  limits: {
    daily: {
      amount: { type: Number, default: 500000 },
      used: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now }
    },
    monthly: {
      amount: { type: Number, default: 2000000 },
      used: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now }
    }
  },
  virtualAccounts: [{
    provider: { type: String, enum: ['paystack', 'flutterwave'] },
    accountNumber: String,
    bankName: String,
    accountName: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }],
  lastTransactionAt: Date,
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  optimisticConcurrency: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
walletSchema.index({ user: 1, tenant: 1, currency: 1 }, { unique: true });
walletSchema.index({ tenant: 1, status: 1 });
walletSchema.index({ tenant: 1, currency: 1 });
walletSchema.index({ user: 1 });
// Additional indexes for aggregation performance
walletSchema.index({ tenant: 1, createdAt: -1 });
walletSchema.index({ balance: -1, tenant: 1 });
walletSchema.index({ status: 1, currency: 1, tenant: 1 });

// Middleware to update version on save
walletSchema.pre('save', function(this: IWallet, next) {
  if (this.isModified('balance') || this.isModified('ledgerBalance')) {
    this.increment();
    this.lastTransactionAt = new Date();
  }
  next();
});

// Methods
walletSchema.methods.canTransact = function(this: IWallet, amount: number): boolean {
  return this.status === 'active' && this.ledgerBalance >= amount;
};

walletSchema.methods.checkDailyLimit = function(this: IWallet, amount: number): boolean {
  const today = new Date();
  const lastReset = new Date(this.limits.daily.lastReset);
  
  if (today.toDateString() !== lastReset.toDateString()) {
    this.limits.daily.used = 0;
    this.limits.daily.lastReset = today;
  }
  
  return (this.limits.daily.used + amount) <= this.limits.daily.amount;
};

walletSchema.methods.updateDailyUsage = function(this: IWallet, amount: number): void {
  this.limits.daily.used += amount;
};

walletSchema.methods.formatBalance = function(this: IWallet): IFormattedBalance {
  return {
    balance: this.balance / 100, 
    ledgerBalance: this.ledgerBalance / 100,
    currency: this.currency
  };
};

export default model<IWallet>('Wallet', walletSchema);