import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';

export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public type: string;

  constructor(message: string, statusCode: number) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.type = 'general_error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public field: string | undefined;
  public override type: string;

  constructor(message: string, field?: string) {
    super(message, 400);
    this.field = field;
    this.type = 'validation_error';
  }
}

export class AuthenticationError extends AppError {
  public override type: string;

  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.type = 'authentication_error';
  }
}

export class AuthorizationError extends AppError {
  public override type: string;

  constructor(message: string = 'Access denied') {
    super(message, 403);
    this.type = 'authorization_error';
  }
}

export class NotFoundError extends AppError {
  public override type: string;

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404);
    this.type = 'not_found_error';
  }
}

export class ConflictError extends AppError {
  public override type: string;

  constructor(message: string) {
    super(message, 409);
    this.type = 'conflict_error';
  }
}

export class RateLimitError extends AppError {
  public override type: string;

  constructor(message: string = 'Too many requests') {
    super(message, 429);
    this.type = 'rate_limit_error';
  }
}

export class ExternalServiceError extends AppError {
  public service: string;
  public override type: string;

  constructor(service: string, message: string) {
    super(`${service} service error: ${message}`, 502);
    this.service = service;
    this.type = 'external_service_error';
  }
}

export class DatabaseError extends AppError {
  public override type: string;

  constructor(message: string = 'Database operation failed') {
    super(message, 500);
    this.type = 'database_error';
  }
}

export class PaymentError extends AppError {
  public provider: string | undefined;
  public override type: string;

  constructor(message: string, provider?: string) {
    super(message, 400);
    this.provider = provider;
    this.type = 'payment_error';
  }
}

export class InsufficientFundsError extends AppError {
  public available: number;
  public required: number;
  public override type: string;

  constructor(available: number, required: number) {
    super(`Insufficient funds. Available: ${available}, Required: ${required}`, 400);
    this.available = available;
    this.required = required;
    this.type = 'insufficient_funds_error';
  }
}

export class FraudError extends AppError {
  public reason: string;
  public riskScore: number | undefined;
  public override type: string;

  constructor(reason: string, riskScore?: number) {
    super(`Transaction blocked due to fraud detection: ${reason}`, 403);
    this.reason = reason;
    this.riskScore = riskScore;
    this.type = 'fraud_error';
  }
}

// Error response formatter
export const formatErrorResponse = (error: AppError): any => {
  const response: any = {
    status: 'error',
    message: error.message,
    type: error.type || 'general_error',
    timestamp: new Date().toISOString()
  };
  
  // Add additional context for specific error types
  if ('field' in error && error.field) {
    response.field = error.field;
  }
  
  if ('provider' in error && error.provider) {
    response.provider = error.provider;
  }
  
  if ('available' in error && 'required' in error) {
    response.details = {
      available: error.available,
      required: error.required
    };
  }
  
  if ('riskScore' in error && error.riskScore !== undefined) {
    response.riskScore = error.riskScore;
  }
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }
  
  return response;
};

// Async error handler wrapper
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// Error logger with context
export const logError = (error: Error, context: any = {}): void => {
  const logger = require('@/config/logger').default;
  
  logger.error('Application Error:', {
    message: error.message,
    type: (error as any).type || error.constructor.name,
    statusCode: (error as any).statusCode,
    stack: error.stack,
    context
  });
};