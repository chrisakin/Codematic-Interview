import { Schema, model } from 'mongoose';
import { ITenant, ITenantSettings, IProviderConfigs } from '@/types';

const tenantSchema = new Schema<ITenant>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  businessType: {
    type: String,
    required: true,
    enum: ['ecommerce', 'fintech', 'marketplace', 'saas']
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'pending'
  },
  apiKey: {
    type: String,
    required: true,
    unique: true
  },
  secretKey: {
    type: String,
    required: true
  },
  settings: {
    webhookUrl: String,
    enabledProviders: [{
      type: String,
      enum: ['paystack', 'flutterwave', 'stripe']
    }],
    rateLimit: {
      requests: { type: Number, default: 1000 },
      windowMs: { type: Number, default: 900000 } // 15 minutes
    },
    fraudDetection: {
      enabled: { type: Boolean, default: true },
      maxTransactionAmount: { type: Number, default: 1000000 }, // in minor currency unit
      dailyTransactionLimit: { type: Number, default: 5000000 }
    }
  },
  providerConfigs: {
    paystack: {
      publicKey: String,
      secretKey: String,
      webhookSecret: String
    },
    flutterwave: {
      publicKey: String,
      secretKey: String,
      webhookSecret: String
    },
    stripe: {
      publicKey: String,
      secretKey: String,
      webhookSecret: String
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
tenantSchema.index({ email: 1 }, { unique: true });
tenantSchema.index({ apiKey: 1 }, { unique: true });
tenantSchema.index({ status: 1 });

// Virtual for users count
tenantSchema.virtual('usersCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'tenant',
  count: true
});

// Methods
tenantSchema.methods.isActive = function(this: ITenant): boolean {
  return this.status === 'active';
};

tenantSchema.methods.toSafeJSON = function(this: ITenant): Partial<ITenant> {
  const tenant = this.toObject();
  delete tenant.secretKey;
  delete tenant.providerConfigs;
  return tenant;
};

export default model<ITenant>('Tenant', tenantSchema);