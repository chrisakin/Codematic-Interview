import express, { Request, Response } from 'express';
import { query, validationResult } from 'express-validator';

import { authenticate, authorize } from '@/middleware/auth';
import { AppError, catchAsync } from '@/utils/errors';
import { IAuthenticatedRequest } from '@/types';
import { getQueueStats, retryFailedJobs, cleanQueue } from '@/jobs/queue';
import { getWorkerHealth } from '@/jobs/processor';

const router = express.Router();

// Apply authentication and admin authorization to all admin routes
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @swagger
 * /api/admin/health:
 *   get:
 *     summary: Get system health status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 */
router.get('/health', catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const workerHealth = getWorkerHealth();
  
  res.json({
    status: 'success',
    data: {
      workers: workerHealth,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
}));

/**
 * @swagger
 * /api/admin/queue-stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue statistics retrieved successfully
 */
router.get('/queue-stats', catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const [transactionStats, webhookStats, notificationStats] = await Promise.all([
    getQueueStats('transaction'),
    getQueueStats('webhook'),
    getQueueStats('notification')
  ]);

  res.json({
    status: 'success',
    data: {
      transaction: transactionStats,
      webhook: webhookStats,
      notification: notificationStats
    }
  });
}));

/**
 * @swagger
 * /api/admin/retry-failed-jobs:
 *   post:
 *     summary: Retry failed jobs in a queue
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: queue
 *         required: true
 *         schema:
 *           type: string
 *           enum: [transaction, webhook, notification]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Failed jobs retry initiated
 */
router.post('/retry-failed-jobs', [
  query('queue').isIn(['transaction', 'webhook', 'notification']).withMessage('Valid queue name required'),
  query('limit').optional().isInt({ min: 1, max: 100 })
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { queue, limit = 10 } = req.query;

  const result = await retryFailedJobs(queue as string, Number(limit));

  res.json({
    status: 'success',
    message: 'Failed jobs retry initiated',
    data: result
  });
}));

/**
 * @swagger
 * /api/admin/clean-queue:
 *   post:
 *     summary: Clean completed and failed jobs from a queue
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: queue
 *         required: true
 *         schema:
 *           type: string
 *           enum: [transaction, webhook, notification]
 *       - in: query
 *         name: olderThan
 *         schema:
 *           type: integer
 *           description: Age in milliseconds (default 24 hours)
 *     responses:
 *       200:
 *         description: Queue cleaned successfully
 */
router.post('/clean-queue', [
  query('queue').isIn(['transaction', 'webhook', 'notification']).withMessage('Valid queue name required'),
  query('olderThan').optional().isInt({ min: 1 })
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { queue, olderThan = 24 * 60 * 60 * 1000 } = req.query; // 24 hours default

  const result = await cleanQueue(queue as string, Number(olderThan));

  res.json({
    status: 'success',
    message: 'Queue cleaned successfully',
    data: result
  });
}));

export default router;