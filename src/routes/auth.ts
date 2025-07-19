import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

import User from '@/models/User';
import Tenant from '@/models/Tenant';
import { authenticate, authenticateApiKey } from '@/middleware/auth';
import { AppError, catchAsync } from '@/utils/errors';
import logger from '@/config/logger';
import { IAuthenticatedRequest, IUser, ITenant } from '@/types';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - tenantId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               tenantId:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.post('/register', [
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('tenantId').isMongoId().withMessage('Valid tenant ID required')
], catchAsync(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { email, password, firstName, lastName, phoneNumber, tenantId } = req.body;

  // Check if tenant exists and is active
  const tenant = await Tenant.findById(tenantId) as ITenant;
  if (!tenant) {
    throw new AppError('Tenant not found', 404);
  }

  if (!tenant.isActive()) {
    throw new AppError('Tenant is not active', 400);
  }

  // Check if user already exists for this tenant
  const existingUser = await User.findOne({ email, tenant: tenantId }) as IUser;
  if (existingUser) {
    throw new AppError('User already exists for this tenant', 409);
  }

  // Create user
  const user = new User({
    email,
    password,
    firstName,
    lastName,
    phoneNumber,
    tenant: tenantId,
    status: 'active' // Auto-activate for demo purposes
  }) as IUser;

  await user.save();

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id, tenantId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  logger.info(`User registered: ${email} for tenant ${tenantId}`);

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully',
    data: {
      user: user.toSafeJSON(),
      token
    }
  });
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - tenantId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               tenantId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', [
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('tenantId').isMongoId().withMessage('Valid tenant ID required')
], catchAsync(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { email, password, tenantId } = req.body;

  // Find user with tenant
  const user = await User.findOne({ email, tenant: tenantId }).populate('tenant') as IUser;
  
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  // Check if user account is active
  if (user.status !== 'active') {
    throw new AppError('Account is not active', 401);
  }

  // Check if tenant is active
  if (!user.tenant.isActive()) {
    throw new AppError('Tenant account is not active', 401);
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401);
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id, tenantId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  logger.info(`User logged in: ${email} for tenant ${tenantId}`);

  res.json({
    status: 'success',
    message: 'Login successful',
    data: {
      user: user.toSafeJSON(),
      tenant: user.tenant.toSafeJSON(),
      token
    }
  });
}));

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
router.get('/profile', authenticate, catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  res.json({
    status: 'success',
    data: {
      user: req.user.toSafeJSON(),
      tenant: req.tenant.toSafeJSON()
    }
  });
}));

/**
 * @swagger
 * /api/auth/change-password:
 *   patch:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.patch('/change-password', [
  authenticate,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { currentPassword, newPassword } = req.body;

  // Verify current password
  const isCurrentPasswordValid = await req.user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Update password
  req.user.password = newPassword;
  await req.user.save();

  logger.info(`Password changed for user: ${req.user.email}`);

  res.json({
    status: 'success',
    message: 'Password changed successfully'
  });
}));

/**
 * @swagger
 * /api/auth/verify-token:
 *   post:
 *     summary: Verify JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token is valid
 */
router.post('/verify-token', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError('Token is required', 400);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    
    // Check if user still exists
    const user = await User.findById(decoded.userId).populate('tenant') as IUser;
    
    if (!user) {
      throw new AppError('User no longer exists', 401);
    }

    if (user.status !== 'active' || !user.tenant.isActive()) {
      throw new AppError('Account is not active', 401);
    }

    res.json({
      status: 'success',
      message: 'Token is valid',
      data: {
        user: user.toSafeJSON(),
        tenant: user.tenant.toSafeJSON(),
        expiresAt: new Date(decoded.exp * 1000)
      }
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token', 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token expired', 401);
    }
    throw error;
  }
}));

// Tenant registration (for platform admin use)
router.post('/register-tenant', [
  authenticateApiKey,
  body('name').trim().isLength({ min: 1 }).withMessage('Tenant name is required'),
  body('email').isEmail().normalizeEmail(),
  body('businessType').isIn(['ecommerce', 'fintech', 'marketplace', 'saas'])
], catchAsync(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { name, email, businessType } = req.body;

  // Check if tenant already exists
  const existingTenant = await Tenant.findOne({ email }) as ITenant;
  if (existingTenant) {
    throw new AppError('Tenant already exists', 409);
  }

  // Generate API keys
  const crypto = await import('crypto');
  const apiKey = `pk_${crypto.randomBytes(20).toString('hex')}`;
  const secretKey = `sk_${crypto.randomBytes(32).toString('hex')}`;

  const tenant = new Tenant({
    name,
    email,
    businessType,
    apiKey,
    secretKey,
    status: 'active',
    settings: {
      enabledProviders: ['paystack'],
      rateLimit: {
        requests: 1000,
        windowMs: 900000 // 15 minutes
      }
    }
  }) as ITenant;

  await tenant.save();

  logger.info(`Tenant registered: ${name} (${email})`);

  res.status(201).json({
    status: 'success',
    message: 'Tenant registered successfully',
    data: {
      tenant: tenant.toSafeJSON(),
      apiKey: tenant.apiKey
    }
  });
}));

export default router;