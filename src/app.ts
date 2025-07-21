import 'reflect-metadata';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import connectDB from '@/config/database';
import connectRedis from '@/config/redis';
import logger from '@/config/logger';
import { errorHandler, notFound } from '@/middleware/errorHandler';
import { setupSwagger } from '@/config/swagger';

// Import routes
import authRoutes from '@/routes/auth';
import walletRoutes from '@/routes/wallet';
import transactionRoutes from '@/routes/transaction';
import webhookRoutes from '@/routes/webhook';
import adminRoutes from '@/routes/admin';
import { initQueues } from './jobs/queue';
import { initWorkers } from '@/jobs/processor';

const app: Application = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Data sanitization
app.use(mongoSanitize());

// Setup Swagger documentation
setupSwagger(app);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.version
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT: number = parseInt(process.env.PORT || '3300', 10);

async function startServer(): Promise<void> {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();
    initQueues();
    initWorkers()
    // Start background job processor
    await import('@/jobs/processor');
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Swagger docs available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error, Promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', Promise, 'reason:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

if (require.main === module) {
  startServer();
}

export default app;