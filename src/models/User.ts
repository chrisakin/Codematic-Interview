import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '@/types';

const userSchema = new Schema<IUser>({
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
    type: Schema.Types.ObjectId,
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
userSchema.virtual('isLocked').get(function(this: IUser): boolean {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(this: IUser, next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Methods
userSchema.methods.comparePassword = async function(this: IUser, candidatePassword: string): Promise<boolean> {
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
      this.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }
    await this.save();
    return false;
  }
};

userSchema.methods.toSafeJSON = function(this: IUser): Partial<IUser> {
  const user = this.toObject();
  delete user.password;
  delete user.loginAttempts;
  delete user.lockUntil;
  return user;
};

export default model<IUser>('User', userSchema);