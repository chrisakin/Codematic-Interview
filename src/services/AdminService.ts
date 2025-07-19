import { getQueueStats, retryFailedJobs, cleanQueue } from '@/jobs/queue';
import { getWorkerHealth } from '@/jobs/processor';

export class AdminService {
  async getSystemHealth() {
    const workerHealth = getWorkerHealth();
    
    return {
      workers: workerHealth,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  async getQueueStats() {
    const [transactionStats, webhookStats, notificationStats] = await Promise.all([
      getQueueStats('transaction'),
      getQueueStats('webhook'),
      getQueueStats('notification')
    ]);

    return {
      transaction: transactionStats,
      webhook: webhookStats,
      notification: notificationStats
    };
  }

  async retryFailedJobs(queue: string, limit: number = 10) {
    return await retryFailedJobs(queue, limit);
  }

  async cleanQueue(queue: string, olderThan: number = 24 * 60 * 60 * 1000) {
    return await cleanQueue(queue, olderThan);
  }
}