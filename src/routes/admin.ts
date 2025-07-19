import express from 'express';
import { AdminController } from '@/controllers/AdminController';
import { AdminService } from '@/services/AdminService';
import { authenticate, authorize } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { RetryFailedJobsDto, CleanQueueDto } from '@/dto/admin.dto';

const router = express.Router();

// Apply authentication and admin authorization to all admin routes
router.use(authenticate);
router.use(authorize('admin'));

// Initialize services and controller
const adminService = new AdminService();
const adminController = new AdminController(adminService);

/**
 * @swagger
 * /api/admin/health:
 *   get:
 *     summary: Get system health status
 *     tags: [Admin]
 */
router.get('/health', adminController.getSystemHealth);

/**
 * @swagger
 * /api/admin/queue-stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Admin]
 */
router.get('/queue-stats', adminController.getQueueStats);

/**
 * @swagger
 * /api/admin/retry-failed-jobs:
 *   post:
 *     summary: Retry failed jobs in a queue
 *     tags: [Admin]
 */
router.post('/retry-failed-jobs', [
  validateDto(RetryFailedJobsDto, 'query')
], adminController.retryFailedJobs);

/**
 * @swagger
 * /api/admin/clean-queue:
 *   post:
 *     summary: Clean completed and failed jobs from a queue
 *     tags: [Admin]
 */
router.post('/clean-queue', [
  validateDto(CleanQueueDto, 'query')
], adminController.cleanQueue);

export default router;