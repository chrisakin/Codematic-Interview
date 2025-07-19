import { Currency } from '@/types';
import { APP_CONSTANTS } from './constants';
import logger from '@/config/logger';

/**
 * Convert amount between currencies
 */
export const convertCurrency = (
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): number => {
  if (fromCurrency === toCurrency) {
    return amount;
  }
  
  const rates = APP_CONSTANTS.CURRENCY_RATES[fromCurrency];
  if (!rates || !rates[toCurrency]) {
    throw new Error(`Conversion rate not available for ${fromCurrency} to ${toCurrency}`);
  }
  
  return Math.round(amount * rates[toCurrency]);
};

/**
 * Format amount for display
 */
export const formatAmount = (amount: number, currency: Currency): string => {
  const majorAmount = amount / 100;
  
  const formatters: Record<Currency, Intl.NumberFormat> = {
    NGN: new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }),
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
    EUR: new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' })
  };
  
  return formatters[currency].format(majorAmount);
};

/**
 * Calculate transaction fees
 */
export const calculateFees = (
  amount: number,
  transactionType: 'deposit' | 'withdrawal' | 'transfer',
  provider?: string
): { platformFee: number; providerFee: number; totalFee: number } => {
  const platformFeeRate = APP_CONSTANTS.FEES.PLATFORM[transactionType.toUpperCase() as keyof typeof APP_CONSTANTS.FEES.PLATFORM] || 0;
  const platformFee = Math.round((amount * platformFeeRate) / 10000);
  
  let providerFee = 0;
  if (provider && transactionType !== 'transfer') {
    const providerFeeRate = (APP_CONSTANTS.FEES.PROVIDER as any)[provider.toUpperCase()]?.[transactionType.toUpperCase()] || 0;
    providerFee = Math.round((amount * providerFeeRate) / 10000);
  }
  
  return {
    platformFee,
    providerFee,
    totalFee: platformFee + providerFee
  };
};

/**
 * Validate transaction amount against limits
 */
export const validateTransactionAmount = (
  amount: number,
  currency: Currency,
  dailyUsed: number = 0
): { isValid: boolean; reason?: string } => {
  const limits = APP_CONSTANTS.TRANSACTION_LIMITS[currency];
  
  if (amount < limits.MIN) {
    return {
      isValid: false,
      reason: `Amount below minimum limit of ${formatAmount(limits.MIN, currency)}`
    };
  }
  
  if (amount > limits.MAX) {
    return {
      isValid: false,
      reason: `Amount exceeds maximum limit of ${formatAmount(limits.MAX, currency)}`
    };
  }
  
  if (dailyUsed + amount > limits.DAILY) {
    return {
      isValid: false,
      reason: `Transaction would exceed daily limit of ${formatAmount(limits.DAILY, currency)}`
    };
  }
  
  return { isValid: true };
};

/**
 * Generate secure random string
 */
export const generateSecureRandom = (length: number = 32): string => {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Mask sensitive data for logging
 */
export const maskSensitiveData = (data: any): any => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveFields = ['password', 'secretKey', 'apiKey', 'token', 'cardNumber', 'cvv', 'pin'];
  const masked = { ...data };
  
  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '***MASKED***';
    }
  }
  
  return masked;
};

/**
 * Retry function with exponential backoff
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Generate transaction reference
 */
export const generateTransactionReference = (prefix: string = 'TXN'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Check if environment is production
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Get client IP address from request
 */
export const getClientIP = (req: any): string => {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         'unknown';
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Deep clone object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Check if object is empty
 */
export const isEmpty = (obj: any): boolean => {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
};