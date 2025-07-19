import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import { AppError } from '@/utils/errors';
import logger from '@/config/logger';
import { IUser, ITenant } from '@/types';
import { RegisterUserDto, LoginUserDto, ChangePasswordDto } from '@/dto/auth.dto';

export class AuthService {
  async registerUser(dto: RegisterUserDto) {
    // Check if tenant exists and is active
    const tenant = await Tenant.findById(dto.tenantId) as ITenant;
    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }

    if (!tenant.isActive()) {
      throw new AppError('Tenant is not active', 400);
    }

    // Check if user already exists for this tenant
    const existingUser = await User.findOne({ 
      email: dto.email, 
      tenant: dto.tenantId 
    }) as IUser;
    
    if (existingUser) {
      throw new AppError('User already exists for this tenant', 409);
    }

    // Create user
    const user = new User({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber,
      tenant: dto.tenantId,
      status: 'active'
    }) as IUser;

    await user.save();

    // Generate JWT token
    const token = this.generateToken(user._id, new Types.ObjectId(dto.tenantId));

    logger.info(`User registered: ${dto.email} for tenant ${dto.tenantId}`);

    return {
      user: user.toSafeJSON(),
      token
    };
  }

  async loginUser(dto: LoginUserDto) {
    // Find user with tenant
    const user = await User.findOne({ 
      email: dto.email, 
      tenant: dto.tenantId 
    }).populate('tenant') as IUser;
    
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    // Check if user account is active
    if (user.status !== 'active') {
      throw new AppError('Account is not active', 401);
    }

    // Check if tenant is active
    const tenant = user.tenant as ITenant;
    if (!tenant.isActive()) {
      throw new AppError('Tenant account is not active', 401);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(dto.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate JWT token
    const token = this.generateToken(user._id, new Types.ObjectId(dto.tenantId));

    logger.info(`User logged in: ${dto.email} for tenant ${dto.tenantId}`);

    return {
      user: user.toSafeJSON(),
      tenant: tenant.toSafeJSON(),
      token
    };
  }

  async changePassword(userId: Types.ObjectId, dto: ChangePasswordDto) {
    const user = await User.findById(userId) as IUser;
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(dto.currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    // Update password
    user.password = dto.newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);
  }

  async verifyToken(token: string) {
    try {
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'your-secret-key'
      ) as any;
      
      // Check if user still exists
      const user = await User.findById(decoded.userId).populate('tenant') as IUser;
      
      if (!user) {
        throw new AppError('User no longer exists', 401);
      }

      if (user.status !== 'active' || !user.tenant.isActive()) {
        throw new AppError('Account is not active', 401);
      }

      return {
        user: user.toSafeJSON(),
        tenant: user.tenant.toSafeJSON(),
        expiresAt: new Date(decoded.exp * 1000)
      };
    } catch (error: any) {
      if (error.name === 'JsonWebTokenError') {
        throw new AppError('Invalid token', 401);
      }
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Token expired', 401);
      }
      throw error;
    }
  }

  private generateToken(userId: Types.ObjectId, tenantId: Types.ObjectId): string {
    return jwt.sign(
      { userId, tenantId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }
}