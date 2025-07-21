# Codematic Interview Assessment - Multi-Provider Virtual Wallet & Payment System

A comprehensive multi-provider virtual wallet and payment system built with Node.js, Express, MongoDB, and Redis. This system supports multiple payment providers (Paystack, Flutterwave, Stripe) with advanced features like fraud detection, webhooks, and background job processing.

The application consists of the following folders
- Config   
- Controller
- Routes
- Dtos
- Jobs
- Middleware
- Jobs
- Providers
- Services
- Types
- Utils

## 🏗️ Architecture Overview

### Core Components
- **Multi-tenant Architecture**: Each business operates independently with their own users and wallets
- **Provider Abstraction Layer**: Unified interface for different payment providers
- **Background Job Processing**: Async handling of transactions and notifications using BullMQ
- **Redis Caching**: High-performance caching for wallets and transaction data
- **Fraud Detection**: Real-time risk assessment and blocking
- **Webhook Management**: Reliable webhook delivery with retry mechanisms

### Key Features
- ✅ Multi-currency wallet support (NGN, USD, GBP, EUR)
- ✅ Atomic transaction processing with optimistic locking
- ✅ Idempotency for all transaction endpoints
- ✅ Real-time fraud detection and risk scoring
- ✅ Webhook replay functionality for failed deliveries
- ✅ Comprehensive audit logging
- ✅ Rate limiting per tenant
- ✅ JWT-based authentication with tenant isolation
- ✅ Swagger API documentation
- ✅ Background job queue with retry logic
- ✅ Redis caching with distributed locking

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 7+
- Redis 7+
- Docker & Docker Compose (optional)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd codematic-interview
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start with Docker Compose (Recommended)**
```bash
docker-compose up -d
```

Or manually:
```bash
# Start MongoDB and Redis
# Then run the application
npm run dev
```

5. **Access the application**
- API: http://localhost:3003
- Swagger Docs: http://localhost:3003/api-docs


## 📖 API Documentation

### Authentication
All API endpoints require authentication except for webhooks and health checks.

```bash
# Register a tenant (admin operation)
POST /api/auth/register-tenant
{
  "name": "My Business",
  "email": "business@example.com",
  "businessType": "ecommerce"
}

# Register a user
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "tenantId": "tenant_id_here"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123",
  "tenantId": "tenant_id_here"
}
```

### Wallet Operations
```bash
# Create wallet
POST /api/wallets
Authorization: Bearer <token>
{
  "currency": "NGN"
}

# Get wallet balance
GET /api/wallets/NGN/balance
Authorization: Bearer <token>

# Fund wallet (demo purposes)
POST /api/wallets/NGN/fund
Authorization: Bearer <token>
{
  "amount": 1000.00,
  "description": "Test funding"
}

# Transfer between wallets
POST /api/wallets/transfer
Authorization: Bearer <token>
{
  "fromCurrency": "NGN",
  "toCurrency": "USD",
  "amount": 100.00,
  "description": "Currency exchange"
}
```

### Transaction Processing
```bash
# Initialize transaction
POST /api/transactions
Authorization: Bearer <token>
{
  "type": "deposit",
  "amount": 5000.00,
  "currency": "NGN",
  "description": "Wallet funding",
  "paymentMethod": "card",
  "provider": "paystack",
  "idempotencyKey": "unique-key-here"
}

# Get transaction by reference
GET /api/transactions/TXN_ABC123
Authorization: Bearer <token>

# Retry failed transaction
POST /api/transactions/TXN_ABC123/retry
Authorization: Bearer <token>
```

### Webhook Endpoints
```bash
# Paystack webhook
POST /api/webhooks/paystack
X-Paystack-Signature: <signature>

# Flutterwave webhook  
POST /api/webhooks/flutterwave
verif-hash: <signature>

# Stripe webhook
POST /api/webhooks/stripe
Stripe-Signature: <signature>

# Replay webhook
POST /api/webhooks/replay/transaction_id
Authorization: Bearer <token>
```

## 🏛️ Database Schema

### Core Models

**Tenant**
- Multi-tenant configuration
- API keys and provider settings
- Rate limiting and fraud rules

**User** 
- User authentication and KYC data
- Tenant association
- Account security features

**Wallet**
- Multi-currency support
- Balance and ledger tracking
- Transaction limits and virtual accounts

**Transaction**
- Comprehensive transaction records
- Provider responses and metadata
- Fraud detection scores
- Webhook delivery status

### Indexes for Performance
```javascript
// High-performance compound indexes
{ tenant: 1, user: 1, currency: 1 } // Wallet lookup
{ tenant: 1, reference: 1 } // Transaction lookup
{ user: 1, createdAt: -1 } // Transaction history
{ webhookStatus: 1, webhookAttempts: 1 } // Webhook retry
```

## 🔒 Security Features

### Authentication & Authorization
- JWT tokens with tenant isolation
- API key authentication for webhooks
- Role-based access control
- Account lockout after failed attempts

### Fraud Detection
- Real-time transaction risk scoring
- Velocity checking and device fingerprinting
- IP blacklisting and VPN detection
- Stolen card database integration
- Configurable risk thresholds

### Data Protection
- Sensitive data encryption at rest
- Webhook signature verification
- Rate limiting per tenant
- Input validation and sanitization

## ⚡ Performance & Scalability

### Caching Strategy
- Redis caching for wallet balances
- Transaction result caching
- Distributed locking for concurrency
- Cache invalidation on updates

### Database Optimization
- Optimistic concurrency control
- Strategic indexing for queries
- Connection pooling
- Query optimization

### Background Processing
- BullMQ for async job processing
- Separate queues for different job types
- Retry mechanisms with exponential backoff
- Dead letter queues for failed jobs

## 🔧 Configuration

### Environment Variables
Key configuration options in `.env`:

```bash
# Core settings
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/virtual-wallet
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-character-key

# Payment Providers
PAYSTACK_SECRET_KEY=sk_test_xxx
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxx
STRIPE_SECRET_KEY=sk_test_xxx

# Fraud Detection
FRAUD_DETECTION_ENABLED=true
MAX_DAILY_TRANSACTION_AMOUNT=1000000
```

### Provider Configuration
Each tenant can configure multiple payment providers:

```javascript
{
  "providerConfigs": {
    "paystack": {
      "publicKey": "pk_test_xxx",
      "secretKey": "sk_test_xxx", 
      "webhookSecret": "webhook_secret"
    },
    "flutterwave": {
      "publicKey": "FLWPUBK_TEST-xxx",
      "secretKey": "FLWSECK_TEST-xxx",
      "webhookSecret": "webhook_secret" 
    }
  }
}
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build image
docker build -t virtual-wallet .

# Run container
docker run -p 3000:3000 virtual-wallet
```

### GCP Deployment
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/virtual-wallet', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/virtual-wallet']
  - name: 'gcr.io/cloud-builders/gcloud'
    args: ['run', 'deploy', 'virtual-wallet', 
           '--image', 'gcr.io/$PROJECT_ID/virtual-wallet',
           '--platform', 'managed']
```

## 🔄 Background Jobs

### Job Types
- **Transaction Processing**: Async transaction handling
- **Webhook Delivery**: Reliable webhook sending with retries
- **Notifications**: Email, SMS, and push notifications
- **Cleanup**: Periodic cleanup of old jobs and logs

### Queue Configuration
```javascript
const queueConfig = {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
};
```
