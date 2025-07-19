const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Tenant:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - businessType
 *       properties:
 *         name:
 *           type: string
 *           description: Business name
 *         email:
 *           type: string
 *           format: email
 *           description: Business email
 *         businessType:
 *           type: string
 *           enum: [ecommerce, fintech, marketplace, saas]
 *         status:
 *           type: string
 *           enum: [active, suspended, pending]
 *         settings:
 *           type: object
 *           properties:
 *             webhookUrl:
 *               type: string
 *             enabledProviders:
 *               type: array
 *               items:
 *                 type: string
 *             rateLimit:
 *               type: object
 */

const tenantSchema = new mongoose.Schema({
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
tenantSchema.methods.isActive = function() {
  return this.status === 'active';
};

tenantSchema.methods.toSafeJSON = function() {
  const tenant = this.toObject();
  delete tenant.secretKey;
  delete tenant.providerConfigs;
  return tenant;
};

module.exports = mongoose.model('Tenant', tenantSchema);