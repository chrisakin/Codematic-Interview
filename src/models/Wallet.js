const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Wallet:
 *       type: object
 *       required:
 *         - user
 *         - tenant
 *         - currency
 *       properties:
 *         user:
 *           type: string
 *           format: objectId
 *         currency:
 *           type: string
 *           enum: [NGN, USD, GBP, EUR]
 *         balance:
 *           type: number
 *           description: Balance in minor currency unit (kobo, cents)
 *         ledgerBalance:
 *           type: number
 *           description: Available balance for transactions
 *         status:
 *           type: string
 *           enum: [active, suspended, frozen]
 */

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
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
      amount: { type: Number, default: 500000 }, // in minor currency
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

// Middleware to update version on save
walletSchema.pre('save', function(next) {
  if (this.isModified('balance') || this.isModified('ledgerBalance')) {
    this.increment();
    this.lastTransactionAt = new Date();
  }
  next();
});

// Methods
walletSchema.methods.canTransact = function(amount) {
  return this.status === 'active' && this.ledgerBalance >= amount;
};

walletSchema.methods.checkDailyLimit = function(amount) {
  const today = new Date();
  const lastReset = new Date(this.limits.daily.lastReset);
  
  if (today.toDateString() !== lastReset.toDateString()) {
    this.limits.daily.used = 0;
    this.limits.daily.lastReset = today;
  }
  
  return (this.limits.daily.used + amount) <= this.limits.daily.amount;
};

walletSchema.methods.updateDailyUsage = function(amount) {
  this.limits.daily.used += amount;
};

walletSchema.methods.formatBalance = function() {
  return {
    balance: this.balance / 100, // Convert to major currency unit
    ledgerBalance: this.ledgerBalance / 100,
    currency: this.currency
  };
};

module.exports = mongoose.model('Wallet', walletSchema);