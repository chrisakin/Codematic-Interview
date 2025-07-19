import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import { RedisClientType } from 'redis';

// Import job handlers
import TransactionService from '@/services/TransactionService';
import WebhookService from '@/services/WebhookService';
import NotificationService from '@/services/NotificationService';

// Transaction processing worker
const transactionWorker = new Worker('transaction-processing', async (job: Job) => {
  const { name, data } = job;
  
  try {
    logger.info(`Processing transaction job: ${name}`, { jobId: job.id, data });
    
    switch (name) {
      case 'processTransaction':
        await TransactionService.processTransaction(data.transactionId);
        break;
        
      case 'retryTransaction':
        await TransactionService.retryFailedTransaction(data.transactionId);
        break;
        
      case 'validateTransaction':
        // Additional validation logic
        await TransactionService.validateTransaction(data.transactionId);
        break;
        
      default:
        throw new Error(`Unknown transaction job type: ${name}`);
    }
    
    logger.info(`Transaction job completed: ${name}`, { jobId: job.id });
    
  } catch (error: any) {
    logger.error(`Transaction job failed: ${name}`, { 
      jobId: job.id, 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}, {
  connection: getRedisClient() as any,
  concurrency: 5, // Process up to 5 jobs concurrently
  maxStalledCount: 3,
  stalledInterval: 30000,
  removeOnComplete: 100,
  removeOnFail: 50
});

// Webhook processing worker
const webhookWorker = new Worker('webhook-notifications', async (job: Job) => {
  const { name, data } = job;
  
  try {
    logger.info(`Processing webhook job: ${name}`, { jobId: job.id, data });
    
    switch (name) {
      case 'sendWebhook':
        await WebhookService.sendWebhook(data.transactionId, data.event);
        break;
        
      case 'retryFailedWebhook':
        await WebhookService.retryWebhook(data.webhookId);
        break;
        
      case 'processIncomingWebhook':
        await WebhookService.processIncomingWebhook(
          data.provider,
          data.payload,
          data.signature,
          data.tenantId
        );
        break;
        
      default:
        throw new Error(`Unknown webhook job type: ${name}`);
    }
    
    logger.info(`Webhook job completed: ${name}`, { jobId: job.id });
    
  } catch (error: any) {
    logger.error(`Webhook job failed: ${name}`, { 
      jobId: job.id, 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}, {
  connection: getRedisClient() as any,
  concurrency: 10, // Higher concurrency for webhooks
  maxStalledCount: 3,
  stalledInterval: 30000,
  removeOnComplete: 100,
  removeOnFail: 50
});

// Notification processing worker
const notificationWorker = new Worker('notifications', async (job: Job) => {
  const { name, data } = job;
  
  try {
    logger.info(`Processing notification job: ${name}`, { jobId: job.id, data });
    
    switch (name) {
      case 'sendEmail':
        await NotificationService.sendEmail(data.to, data.subject, data.template, data.data);
        break;
        
      case 'sendSMS':
        await NotificationService.sendSMS(data.to, data.message);
        break;
        
      case 'sendPushNotification':
        await NotificationService.sendPushNotification(data.userId, data.title, data.body, data.data);
        break;
        
      case 'sendSlackAlert':
        await NotificationService.sendSlackAlert(data.channel, data.message, data.level);
        break;
        
      default:
        throw new Error(`Unknown notification job type: ${name}`);
    }
    
    logger.info(`Notification job completed: ${name}`, { jobId: job.id });
    
  } catch (error: any) {
    logger.error(`Notification job failed: ${name}`, { 
      jobId: job.id, 
      error: error.message,
      stack: error.stack 
    });
    throw error;
  }
}, {
  connection: getRedisClient() as any,
  concurrency: 15, // High concurrency for notifications
  maxStalledCount: 2,
  stalledInterval: 30000,
  removeOnComplete: 50,
  removeOnFail: 25
});

// Worker event handlers
[transactionWorker, webhookWorker, notificationWorker].forEach(worker => {
  worker.on('ready', () => {
    logger.info(`Worker ready: ${worker.name}`);
  });
  
  worker.on('error', (error: Error) => {
    logger.error(`Worker error: ${worker.name}`, error);
  });
  
  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (job) {
      logger.error(`Job failed: ${job.name}`, {
        jobId: job.id,
        error: error.message,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade
      });
    }
  });
  
  worker.on('completed', (job: Job) => {
    logger.info(`Job completed: ${job.name}`, {
      jobId: job.id,
      duration: Date.now() - job.timestamp,
      returnvalue: job.returnvalue
    });
  });
  
  worker.on('progress', (job: Job, progress: number | object) => {
    logger.debug(`Job progress: ${job.name}`, {
      jobId: job.id,
      progress: progress
    });
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down workers...');
  
  await Promise.all([
    transactionWorker.close(),
    webhookWorker.close(),
    notificationWorker.close()
  ]);
  
  logger.info('All workers shut down gracefully');
  process.exit(0);
});

// Health check for workers
export const getWorkerHealth = () => {
  return {
    transactionWorker: {
      isRunning: transactionWorker.isRunning(),
      isPaused: transactionWorker.isPaused()
    },
    webhookWorker: {
      isRunning: webhookWorker.isRunning(),
      isPaused: webhookWorker.isPaused()
    },
    notificationWorker: {
      isRunning: notificationWorker.isRunning(),
      isPaused: notificationWorker.isPaused()
    }
  };
};

// Schedule recurring cleanup jobs
import { scheduleRecurringJob } from './queue';

// Clean up old jobs daily at 2 AM
scheduleRecurringJob('notification', 'cleanupJobs', {}, '0 2 * * *');

export {
  transactionWorker,
  webhookWorker,
  notificationWorker
};