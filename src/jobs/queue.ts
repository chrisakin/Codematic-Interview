import { Queue, Job } from 'bullmq';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import { IJobData, IJobOptions } from '@/types';

let transactionQueue: Queue | null = null;
let webhookQueue: Queue | null = null;
let notificationQueue: Queue | null = null;

// Call this after connectRedis()
export function initQueues() {
  const connection = getRedisClient() as any;
  transactionQueue = new Queue('transaction-processing', {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  });
  webhookQueue = new Queue('webhook-notifications', {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 }
    }
  });
  notificationQueue = new Queue('notifications', {
    connection,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 2
    }
  });
}

function getQueue(queueName: string): Queue {
  switch (queueName) {
    case 'transaction':
      if (!transactionQueue) throw new Error('Queues not initialized');
      return transactionQueue;
    case 'webhook':
      if (!webhookQueue) throw new Error('Queues not initialized');
      return webhookQueue;
    case 'notification':
      if (!notificationQueue) throw new Error('Queues not initialized');
      return notificationQueue;
    default:
      throw new Error(`Unknown queue: ${queueName}`);
  }
}

// Add job to queue
export async function addJob(queueName: string, jobType: string, data: IJobData, options: IJobOptions = {}): Promise<Job> {
  try {
    const queue = getQueue(queueName);
    const job = await queue.add(jobType, data, {
      ...options,
      jobId: options.jobId || `${jobType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
    logger.info(`Job added to ${queueName} queue: ${job.id}`);
    return job;
  } catch (error) {
    logger.error(`Failed to add job to ${queueName} queue:`, error);
    throw error;
  }
}

// Simplified addJob function for backward compatibility
export async function addJobSimple(jobType: string, data: IJobData, options: IJobOptions = {}): Promise<Job> {
  const queueMap: Record<string, string> = {
    'processTransaction': 'transaction',
    'sendWebhook': 'webhook',
    'sendNotification': 'notification',
    'retryFailedWebhook': 'webhook'
  };
  const queueName = queueMap[jobType] || 'notification';
  return addJob(queueName, jobType, data, options);
}

// Schedule delayed job
export async function scheduleJob(queueName: string, jobType: string, data: IJobData, delay: number): Promise<Job> {
  return addJob(queueName, jobType, data, { delay });
}

// Schedule recurring job
export async function scheduleRecurringJob(queueName: string, jobType: string, data: IJobData, pattern: string): Promise<Job> {
  return addJob(queueName, jobType, data, { repeat: { pattern } as any });
}

// Get queue statistics
export async function getQueueStats(queueName: string): Promise<any> {
  try {
    const queue = getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed()
    ]);
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length
    };
  } catch (error) {
    logger.error(`Failed to get queue stats for ${queueName}:`, error);
    throw error;
  }
}

// Retry failed jobs
export async function retryFailedJobs(queueName: string, limit: number = 10): Promise<{ retried: number; total: number }> {
  try {
    const queue = getQueue(queueName);
    const failed = await queue.getFailed(0, limit - 1);
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried++;
        logger.info(`Retried failed job: ${job.id}`);
      } catch (error) {
        logger.error(`Failed to retry job ${job.id}:`, error);
      }
    }
    return { retried, total: failed.length };
  } catch (error) {
    logger.error(`Failed to retry jobs in ${queueName} queue:`, error);
    throw error;
  }
}

// Clean completed/failed jobs
export async function cleanQueue(queueName: string, olderThan: number = 24 * 60 * 60 * 1000): Promise<{ completed: number; failed: number }> {
  try {
    const queue = getQueue(queueName);
    const [cleanedCompleted, cleanedFailed] = await Promise.all([
      queue.clean(olderThan, 100, 'completed'),
      queue.clean(olderThan, 100, 'failed')
    ]);
    logger.info(`Cleaned ${queueName} queue: ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
    return {
      completed: cleanedCompleted.length,
      failed: cleanedFailed.length
    };
  } catch (error) {
    logger.error(`Failed to clean ${queueName} queue:`, error);
    throw error;
  }
}

