import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '@/utils/errors';
import { APP_CONSTANTS } from '@/utils/constants';
import { getClientIP, isProduction } from '@/utils/helpers';
import logger from '@/config/logger';

// Enhanced rate limiting with different tiers
export const createRateLimit = (
  windowMs: number = APP_CONSTANTS.RATE_LIMITS.DEFAULT.WINDOW_MS,
  max: number = APP_CONSTANTS.RATE_LIMITS.DEFAULT.MAX_REQUESTS,
  message: string = 'Too many requests from this IP'
) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      status: 'error',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use a combination of IP and user ID for authenticated requests
      const ip = getClientIP(req);
      const userId = (req as any).user?.id;
      return userId ? `${ip}:${userId}` : ip;
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks in production
      return req.path === '/health' && isProduction();
    },
    onLimitReached: (req: Request) => {
      logger.warn('Rate limit exceeded', {
        ip: getClientIP(req),
        path: req.path,
        userAgent: req.get('User-Agent')
      });
    }
  });
};

// Specific rate limiters
export const authRateLimit = createRateLimit(
  APP_CONSTANTS.RATE_LIMITS.AUTH.WINDOW_MS,
  APP_CONSTANTS.RATE_LIMITS.AUTH.MAX_REQUESTS,
  'Too many authentication attempts'
);

export const webhookRateLimit = createRateLimit(
  APP_CONSTANTS.RATE_LIMITS.WEBHOOK.WINDOW_MS,
  APP_CONSTANTS.RATE_LIMITS.WEBHOOK.MAX_REQUESTS,
  'Too many webhook requests'
);

// Request size limiter
export const requestSizeLimit = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const maxSizeInMB = parseInt(maxSize.replace('mb', ''));
      
      if (sizeInMB > maxSizeInMB) {
        return next(new AppError(`Request size exceeds ${maxSize} limit`, 413));
      }
    }
    next();
  };
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (isProduction()) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

// IP whitelist middleware
export const ipWhitelist = (allowedIPs: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (allowedIPs.length === 0) {
      return next();
    }
    
    const clientIP = getClientIP(req);
    
    if (!allowedIPs.includes(clientIP)) {
      logger.warn('IP not in whitelist', { ip: clientIP, path: req.path });
      return next(new AppError('Access denied', 403));
    }
    
    next();
  };
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: getClientIP(req),
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
      tenantId: (req as any).tenant?.id
    };
    
    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });
  
  next();
};

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Webhook-Signature',
    'X-Webhook-Timestamp'
  ]
};

// API key validation middleware
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return next(new AppError('API key required', 401));
  }
  
  // Validate API key format
  if (!apiKey.startsWith('pk_') && !apiKey.startsWith('sk_')) {
    return next(new AppError('Invalid API key format', 401));
  }
  
  next();
};

// Content type validation
export const validateContentType = (expectedType: string = 'application/json') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }
    
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes(expectedType)) {
      return next(new AppError(`Content-Type must be ${expectedType}`, 400));
    }
    
    next();
  };
};