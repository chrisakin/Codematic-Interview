class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400);
    this.field = field;
    this.type = 'validation_error';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.type = 'authentication_error';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.type = 'authorization_error';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.type = 'not_found_error';
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
    this.type = 'conflict_error';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.type = 'rate_limit_error';
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`${service} service error: ${message}`, 502);
    this.service = service;
    this.type = 'external_service_error';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500);
    this.type = 'database_error';
  }
}

class PaymentError extends AppError {
  constructor(message, provider = null) {
    super(message, 400);
    this.provider = provider;
    this.type = 'payment_error';
  }
}

class InsufficientFundsError extends AppError {
  constructor(available, required) {
    super(`Insufficient funds. Available: ${available}, Required: ${required}`, 400);
    this.available = available;
    this.required = required;
    this.type = 'insufficient_funds_error';
  }
}

class FraudError extends AppError {
  constructor(reason, riskScore = null) {
    super(`Transaction blocked due to fraud detection: ${reason}`, 403);
    this.reason = reason;
    this.riskScore = riskScore;
    this.type = 'fraud_error';
  }
}

// Error response formatter
const formatErrorResponse = (error) => {
  const response = {
    status: 'error',
    message: error.message,
    type: error.type || 'general_error',
    timestamp: new Date().toISOString()
  };
  
  // Add additional context for specific error types
  if (error.field) {
    response.field = error.field;
  }
  
  if (error.provider) {
    response.provider = error.provider;
  }
  
  if (error.available !== undefined && error.required !== undefined) {
    response.details = {
      available: error.available,
      required: error.required
    };
  }
  
  if (error.riskScore !== undefined) {
    response.riskScore = error.riskScore;
  }
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }
  
  return response;
};

// Async error handler wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Error logger with context
const logError = (error, context = {}) => {
  const logger = require('../config/logger');
  
  logger.error('Application Error:', {
    message: error.message,
    type: error.type || error.constructor.name,
    statusCode: error.statusCode,
    stack: error.stack,
    context
  });
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  PaymentError,
  InsufficientFundsError,
  FraudError,
  formatErrorResponse,
  catchAsync,
  logError
};