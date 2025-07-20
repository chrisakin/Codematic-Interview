import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import Transaction from '@/models/Transaction';
import { AppError } from '@/utils/errors';
import logger from '@/config/logger';
import { IUser, ITenant, ITransaction } from '@/types';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      tenant?: ITenant;
      transaction?: ITransaction;
      webhookSignature?: string;
      webhookTimestamp?: string;
    }
  }
}

interface JWTPayload {
  userId: string;
  tenantId: string;
  iat: number;
  exp: number;
}

// Verify JWT token and attach user to request
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Access token required', 401));
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next(new AppError('Access token required', 401));
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as JWTPayload;
    
    // Check if user still exists
    const user = await User.findById(decoded.userId).populate('tenant') as IUser;
    
    if (!user) {
      return next(new AppError('User no longer exists', 401));
    }
    
    // Check if user account is active
    if (user.status !== 'active') {
      return next(new AppError('Account is not active', 401));
    }
    
    // Check if tenant is active
    if ((!user.tenant as unknown as ITenant).isActive()) {
      return next(new AppError('Tenant account is not active', 401));
    }
    
    // Attach user and tenant to request
    req.user = user;
    req.tenant = user.tenant as ITenant;
    
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid access token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Access token expired', 401));
    }
    
    logger.error('Authentication error:', error);
    next(new AppError('Authentication failed', 401));
  }
};

// Verify API key for webhook endpoints
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;
    
    if (!apiKey) {
      return next(new AppError('API key required', 401));
    }
    
    const tenant = await Tenant.findOne({ apiKey }) as ITenant;
    
    if (!tenant) {
      return next(new AppError('Invalid API key', 401));
    }
    
    if (!tenant.isActive()) {
      return next(new AppError('Tenant account is not active', 401));
    }
    
    req.tenant = tenant;
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    next(new AppError('Authentication failed', 401));
  }
};

// Verify webhook signature
export const authenticateWebhook = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature = req.headers['x-webhook-signature'] as string || req.headers['x-paystack-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;
    
    if (!signature) {
      return next(new AppError('Webhook signature required', 401));
    }
    
    // Store signature for provider verification
    req.webhookSignature = signature;
    req.webhookTimestamp = timestamp;
    
    next();
  } catch (error) {
    logger.error('Webhook authentication error:', error);
    next(new AppError('Webhook authentication failed', 401));
  }
};

// Authorization middleware
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const userRole = (req.user as any).role || 'user';
    
    if (!roles.includes(userRole)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    
    next();
  };
};

// Check if user is verified (KYC)
export const requireVerification = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }
  
  if (req.user.kycStatus !== 'verified') {
    return next(new AppError('Account verification required', 403));
  }
  
  next();
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as JWTPayload;
    const user = await User.findById(decoded.userId).populate('tenant') as IUser;
    
    if (user && user.status === 'active' && (user.tenant as unknown as ITenant).isActive()) {
      req.user = user;
      req.tenant = user.tenant as ITenant;
    }
    
    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

// Check transaction permissions
export const checkTransactionPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { transactionId } = req.params;
    
    if (!transactionId) {
      return next();
    }
    
    const transaction = await Transaction.findById(transactionId) as ITransaction;
    
    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }
    
    // Check if user owns the transaction or is admin
    if (transaction.user?.toString() !== req.user!._id.toString() && 
        (req.user as any).role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }
    
    // Check if transaction belongs to user's tenant
    if (transaction.tenant.toString() !== req.tenant!._id.toString()) {
      return next(new AppError('Access denied', 403));
    }
    
    req.transaction = transaction;
    next();
  } catch (error) {
    logger.error('Transaction permission check failed:', error);
    next(error);
  }
};