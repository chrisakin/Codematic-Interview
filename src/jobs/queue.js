const { Queue, Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

// Job queues
const transactionQueue = new Queue('transaction-processing', {
  connection: getRedisClient(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

const webhookQueue = new Queue('webhook-notifications', {
  connection: getRedisClient(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

const notificationQueue = new Queue('notifications', {
  connection: getRedisClient(),
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 2
  }
});

// Add job to queue
async function addJob(queueName, jobType, data, options = {}) {
  try {
    let queue;
    
    switch (queueName) {
      case 'transaction':
        queue = transactionQueue;
        break;
      case 'webhook':
        queue = webhookQueue;
        break;
      case 'notification':
        queue = notificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    
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
async function addJobSimple(jobType, data, options = {}) {
  // Map job types to appropriate queues
  const queueMap = {
    'processTransaction': 'transaction',
    'sendWebhook': 'webhook',
    'sendNotification': 'notification',
    'retryFailedWebhook': 'webhook'
  };
  
  const queueName = queueMap[jobType] || 'notification';
  return addJob(queueName, jobType, data, options);
}

// Schedule delayed job
async function scheduleJob(queueName, jobType, data, delay) {
  return addJob(queueName, jobType, data, { delay });
}

// Schedule recurring job
async function scheduleRecurringJob(queueName, jobType, data, pattern) {
  return addJob(queueName, jobType, data, { repeat: { pattern } });
}

// Get queue statistics
async function getQueueStats(queueName) {
  try {
    let queue;
    
    switch (queueName) {
      case 'transaction':
        queue = transactionQueue;
        break;
      case 'webhook':
        queue = webhookQueue;
        break;
      case 'notification':
        queue = notificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    
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
async function retryFailedJobs(queueName, limit = 10) {
  try {
    let queue;
    
    switch (queueName) {
      case 'transaction':
        queue = transactionQueue;
        break;
      case 'webhook':
        queue = webhookQueue;
        break;
      case 'notification':
        queue = notificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    
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
async function cleanQueue(queueName, olderThan = 24 * 60 * 60 * 1000) { // 24 hours default
  try {
    let queue;
    
    switch (queueName) {
      case 'transaction':
        queue = transactionQueue;
        break;
      case 'webhook':
        queue = webhookQueue;
        break;
      case 'notification':
        queue = notificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    
    const [cleanedCompleted, cleanedFailed] = await Promise.all([
      queue.clean(olderThan, 100, 'completed'),
      queue.clean(olderThan, 100, 'failed')
    ]);
    
    logger.info(`Cleaned ${queueName} queue: ${cleanedCompleted} completed, ${cleanedFailed} failed jobs`);
    
    return {
      completed: cleanedCompleted,
      failed: cleanedFailed
    };
    
  } catch (error) {
    logger.error(`Failed to clean ${queueName} queue:`, error);
    throw error;
  }
}

module.exports = {
  transactionQueue,
  webhookQueue,
  notificationQueue,
  addJob,
  addJob: addJobSimple, // Export simplified version as main addJob
  scheduleJob,
  scheduleRecurringJob,
  getQueueStats,
  retryFailedJobs,
  cleanQueue
};