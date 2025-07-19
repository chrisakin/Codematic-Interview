const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { AppError } = require('../utils/errors');
const logger = require('../config/logger');

// Verify JWT token and attach user to request
const authenticate = async (req, res, next) => {
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Check if user still exists
    const user = await User.findById(decoded.userId).populate('tenant');
    
    if (!user) {
      return next(new AppError('User no longer exists', 401));
    }
    
    // Check if user account is active
    if (user.status !== 'active') {
      return next(new AppError('Account is not active', 401));
    }
    
    // Check if tenant is active
    if (!user.tenant.isActive()) {
      return next(new AppError('Tenant account is not active', 401));
    }
    
    // Attach user and tenant to request
    req.user = user;
    req.tenant = user.tenant;
    
    next();
  } catch (error) {
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
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
      return next(new AppError('API key required', 401));
    }
    
    const tenant = await Tenant.findOne({ apiKey });
    
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
const authenticateWebhook = (req, res, next) => {
  try {
    const signature = req.headers['x-webhook-signature'] || req.headers['x-paystack-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    
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
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const userRole = req.user.role || 'user';
    
    if (!roles.includes(userRole)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    
    next();
  };
};

// Check if user is verified (KYC)
const requireVerification = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }
  
  if (req.user.kycStatus !== 'verified') {
    return next(new AppError('Account verification required', 403));
  }
  
  next();
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).populate('tenant');
    
    if (user && user.status === 'active' && user.tenant.isActive()) {
      req.user = user;
      req.tenant = user.tenant;
    }
    
    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

// Rate limiting per tenant
const tenantRateLimit = (req, res, next) => {
  if (!req.tenant) {
    return next();
  }
  
  const rateLimit = require('express-rate-limit');
  
  const limiter = rateLimit({
    windowMs: req.tenant.settings.rateLimit.windowMs || 900000, // 15 minutes
    max: req.tenant.settings.rateLimit.requests || 1000,
    keyGenerator: (req) => `tenant:${req.tenant._id}:${req.ip}`,
    message: {
      error: 'Too many requests from this tenant',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  
  limiter(req, res, next);
};

// Check transaction permissions
const checkTransactionPermissions = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    
    if (!transactionId) {
      return next();
    }
    
    const Transaction = require('../models/Transaction');
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }
    
    // Check if user owns the transaction or is admin
    if (transaction.user.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }
    
    // Check if transaction belongs to user's tenant
    if (transaction.tenant.toString() !== req.tenant._id.toString()) {
      return next(new AppError('Access denied', 403));
    }
    
    req.transaction = transaction;
    next();
  } catch (error) {
    logger.error('Transaction permission check failed:', error);
    next(error);
  }
};

module.exports = {
  authenticate,
  authenticateApiKey,
  authenticateWebhook,
  authorize,
  requireVerification,
  optionalAuth,
  tenantRateLimit,
  checkTransactionPermissions
};