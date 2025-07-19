import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import logger from '@/config/logger';
import { AppError } from '@/utils/errors';

interface MongoError extends Error {
  code?: number;
  keyValue?: Record<string, any>;
  path?: string;
  value?: any;
  errors?: Record<string, any>;
}

const handleCastErrorDB = (err: MongooseError.CastError): AppError => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err: MongoError): AppError => {
  const keys = Object.keys(err.keyValue || {});
  const field = keys[0];

  let message = 'Duplicate field value. Please use another value!';

  if (field && err.keyValue) {
    const value = err.keyValue[field];
    message = `Duplicate field value: ${field} = '${value}'. Please use another value!`;
  }

  return new AppError(message, 400);
};

const handleValidationErrorDB = (err: MongooseError.ValidationError): AppError => {
  const errors = Object.values(err.errors).map(el => (el as any).message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = (): AppError =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = (): AppError =>
  new AppError('Your token has expired! Please log in again.', 401);

const sendErrorDev = (err: AppError, req: Request, res: Response): Response => {
  // Log error for development
  console.error('ERROR 💥', err);
  
  return res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
};

const sendErrorProd = (err: AppError, req: Request, res: Response): Response => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }
  
  // Programming or other unknown error: don't leak error details
  logger.error('ERROR 💥', {
    error: err,
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      user: (req as any).user?.id,
      tenant: (req as any).tenant?.id
    }
  });
  
  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    timestamp: new Date().toISOString()
  });
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): Response | void => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  if (process.env.NODE_ENV === 'development') {
    return sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;
    
    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    
    return sendErrorProd(error, req, res);
  }
};

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// Global unhandled rejection handler
process.on('unhandledRejection', (err: Error, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', err);
  // Close server & exit process
  process.exit(1);
});

// Global uncaught exception handler
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception thrown:', err);
  process.exit(1);
});