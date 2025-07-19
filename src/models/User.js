const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - firstName
 *         - lastName
 *         - tenant
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         phoneNumber:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, suspended, pending]
 *         kycStatus:
 *           type: string
 *           enum: [pending, verified, rejected]
 */

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  dateOfBirth: Date,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'pending'
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  kycData: {
    documentType: String,
    documentNumber: String,
    verifiedAt: Date
  },
  lastLoginAt: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for tenant + email uniqueness
userSchema.index({ tenant: 1, email: 1 }, { unique: true });
userSchema.index({ tenant: 1, status: 1 });
userSchema.index({ tenant: 1, kycStatus: 1 });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.isLocked) {
    throw new Error('Account is temporarily locked');
  }
  
  const isMatch = await bcrypt.compare(candidatePassword, this.password);
  
  if (isMatch) {
    if (this.loginAttempts && this.loginAttempts > 0) {
      this.loginAttempts = 0;
      this.lockUntil = undefined;
      await this.save();
    }
    this.lastLoginAt = new Date();
    await this.save();
    return true;
  } else {
    this.loginAttempts = (this.loginAttempts || 0) + 1;
    
    if (this.loginAttempts >= 5) {
      this.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
    }
    await this.save();
    return false;
  }
};

userSchema.methods.toSafeJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.loginAttempts;
  delete user.lockUntil;
  return user;
};

module.exports = mongoose.model('User', userSchema);