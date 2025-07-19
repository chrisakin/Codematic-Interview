// Application constants
export const APP_CONSTANTS = {
  // Currency conversion rates (in production, fetch from external API)
  CURRENCY_RATES: {
    NGN: { USD: 0.0013, GBP: 0.0011, EUR: 0.0012 },
    USD: { NGN: 770, GBP: 0.85, EUR: 0.92 },
    GBP: { NGN: 905, USD: 1.18, EUR: 1.08 },
    EUR: { NGN: 838, USD: 1.09, GBP: 0.93 }
  },
  
  // Transaction limits (in minor currency units)
  TRANSACTION_LIMITS: {
    NGN: {
      MIN: 100, // 1 NGN
      MAX: 10000000, // 100,000 NGN
      DAILY: 50000000 // 500,000 NGN
    },
    USD: {
      MIN: 1, // $0.01
      MAX: 100000, // $1,000
      DAILY: 500000 // $5,000
    },
    GBP: {
      MIN: 1, // £0.01
      MAX: 100000, // £1,000
      DAILY: 500000 // £5,000
    },
    EUR: {
      MIN: 1, // €0.01
      MAX: 100000, // €1,000
      DAILY: 500000 // €5,000
    }
  },
  
  // Fee structures (in basis points - 100 bp = 1%)
  FEES: {
    PLATFORM: {
      DEPOSIT: 0, // No fee for deposits
      WITHDRAWAL: 100, // 1%
      TRANSFER: 50 // 0.5%
    },
    PROVIDER: {
      PAYSTACK: {
        DEPOSIT: 150, // 1.5%
        WITHDRAWAL: 100 // 1%
      },
      FLUTTERWAVE: {
        DEPOSIT: 140, // 1.4%
        WITHDRAWAL: 100 // 1%
      },
      STRIPE: {
        DEPOSIT: 290, // 2.9%
        WITHDRAWAL: 100 // 1%
      }
    }
  },
  
  // Cache TTL values (in seconds)
  CACHE_TTL: {
    WALLET_BALANCE: 60, // 1 minute
    TRANSACTION: 300, // 5 minutes
    USER_SESSION: 3600, // 1 hour
    EXCHANGE_RATES: 1800 // 30 minutes
  },
  
  // Queue settings
  QUEUE_SETTINGS: {
    TRANSACTION: {
      CONCURRENCY: 5,
      ATTEMPTS: 3,
      BACKOFF_DELAY: 5000
    },
    WEBHOOK: {
      CONCURRENCY: 10,
      ATTEMPTS: 5,
      BACKOFF_DELAY: 2000
    },
    NOTIFICATION: {
      CONCURRENCY: 15,
      ATTEMPTS: 2,
      BACKOFF_DELAY: 1000
    }
  },
  
  // Fraud detection thresholds
  FRAUD_THRESHOLDS: {
    LOW_RISK: 30,
    MEDIUM_RISK: 60,
    HIGH_RISK: 80,
    VELOCITY_LIMIT: 20, // transactions per hour
    AMOUNT_MULTIPLIER: 10 // times average transaction
  },
  
  // API rate limits
  RATE_LIMITS: {
    DEFAULT: {
      WINDOW_MS: 900000, // 15 minutes
      MAX_REQUESTS: 100
    },
    AUTH: {
      WINDOW_MS: 900000, // 15 minutes
      MAX_REQUESTS: 10
    },
    WEBHOOK: {
      WINDOW_MS: 60000, // 1 minute
      MAX_REQUESTS: 1000
    }
  },
  
  // Webhook retry settings
  WEBHOOK_RETRY: {
    MAX_ATTEMPTS: 5,
    DELAYS: [1000, 5000, 15000, 60000, 300000], // 1s, 5s, 15s, 1m, 5m
    TIMEOUT: 10000 // 10 seconds
  },
  
  // Supported countries and currencies
  SUPPORTED_COUNTRIES: {
    NG: { currency: 'NGN', name: 'Nigeria' },
    US: { currency: 'USD', name: 'United States' },
    GB: { currency: 'GBP', name: 'United Kingdom' },
    EU: { currency: 'EUR', name: 'European Union' }
  },
  
  // Status codes
  STATUS_CODES: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  }
} as const;

// Type definitions for constants
export type Currency = keyof typeof APP_CONSTANTS.CURRENCY_RATES;
export type Country = keyof typeof APP_CONSTANTS.SUPPORTED_COUNTRIES;
export type Provider = keyof typeof APP_CONSTANTS.FEES.PROVIDER;