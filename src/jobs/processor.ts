import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import IORedis from 'ioredis';

import { TransactionService } from '@/services/TransactionService';
import  WebhookService from '@/services/WebhookService';
import  NotificationService  from '@/services/NotificationService';

import { scheduleRecurringJob } from './queue';

type TransactionJobData = {
  transactionId: string;
};

type WebhookJobData = {
  transactionId?: string;
  event?: string;
  webhookId?: string;
  provider?: string;
  payload?: any;
  signature?: string;
  tenantId?: string;
};

type NotificationJobData = {
  to?: string;
  subject?: string;
  template?: string;
  data?: any;
  message?: string;
  userId?: string;
  title?: string;
  body?: string;
  channel?: string;
  level?: string;
};

let transactionWorker: Worker | undefined;
let webhookWorker: Worker | undefined;
let notificationWorker: Worker | undefined;

export function initWorkers() {
  const connection = new IORedis(); // Defaults to localhost:6379

connection.on('error', (err) => {
    logger.error('Redis connection error:', err);
  });
  transactionWorker = new Worker<TransactionJobData>('transaction-processing', async (job: Job<TransactionJobData>) => {
    const { name, data } = job;
    const transactionService = new TransactionService();

    try {
      logger.info(`Processing transaction job: ${name}`, { jobId: job.id, data });

      switch (name) {
        case 'processTransaction':
          await transactionService.processTransaction(data.transactionId);
          break;
        case 'retryTransaction':
          await transactionService.retryFailedTransaction(data.transactionId);
          break;
        case 'validateTransaction':
          await transactionService.validateTransaction(data.transactionId);
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
    connection,
    concurrency: 15,
    maxStalledCount: 2,
    stalledInterval: 30000,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 }
  });

  webhookWorker = new Worker<WebhookJobData>('webhook-notifications', async (job: Job<WebhookJobData>) => {
    const { name, data } = job;
    const webhookService = new WebhookService();

    try {
      logger.info(`Processing webhook job: ${name}`, { jobId: job.id, data });

      switch (name) {
        case 'sendWebhook':
          if (!data.transactionId || !data.event) throw new Error('Missing data for sendWebhook');
          await webhookService.sendWebhook(data.transactionId, data.event);
          break;
        case 'retryFailedWebhook':
          if (!data.webhookId) throw new Error('Missing webhookId for retryFailedWebhook');
          await webhookService.retryWebhook(data.webhookId);
          break;
        case 'processIncomingWebhook':
          if (!data.provider || !data.payload || !data.signature || !data.tenantId) throw new Error('Missing data for processIncomingWebhook');
          await webhookService.processIncomingWebhook(
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
  },{
    connection,
    concurrency: 15,
    maxStalledCount: 2,
    stalledInterval: 30000,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 }
  });

  notificationWorker = new Worker<NotificationJobData>('notifications', async (job: Job<NotificationJobData>) => {
    const { name, data } = job;
    const notificationService = NotificationService;

    try {
      logger.info(`Processing notification job: ${name}`, { jobId: job.id, data });

      switch (name) {
        case 'sendEmail':
          if (!data.to || !data.subject || !data.template) throw new Error('Missing data for sendEmail');
          await notificationService.sendEmail(data.to, data.subject, data.template, data.data);
          break;
        case 'sendSMS':
          if (!data.to || !data.message) throw new Error('Missing data for sendSMS');
          await notificationService.sendSMS(data.to, data.message);
          break;
        case 'sendPushNotification':
          if (!data.userId || !data.title || !data.body) throw new Error('Missing data for sendPushNotification');
          await notificationService.sendPushNotification(data.userId as any, data.title, data.body, data.data);
          break;
        case 'sendSlackAlert':
          if (!data.channel || !data.message || !data.level) throw new Error('Missing data for sendSlackAlert');
          await notificationService.sendSlackAlert(data.channel, data.message, data.level);
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
    connection,
    concurrency: 15,
    maxStalledCount: 2,
    stalledInterval: 30000,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 }
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
      transactionWorker?.close(),
      webhookWorker?.close(),
      notificationWorker?.close()
    ]);

    logger.info('All workers shut down gracefully');
    process.exit(0);
  });

  // Schedule recurring cleanup jobs
  // Clean up old jobs daily at 2 AM
  scheduleRecurringJob('notification', 'cleanupJobs', {}, '0 2 * * *');
}

export const getWorkerHealth = () => {
  return {
    transactionWorker: {
      isRunning: transactionWorker?.isRunning(),
      isPaused: transactionWorker?.isPaused()
    },
    webhookWorker: {
      isRunning: webhookWorker?.isRunning(),
      isPaused: webhookWorker?.isPaused()
    },
    notificationWorker: {
      isRunning: notificationWorker?.isRunning(),
      isPaused: notificationWorker?.isPaused()
    }
  };
};

export {
  transactionWorker,
  webhookWorker,
  notificationWorker
};