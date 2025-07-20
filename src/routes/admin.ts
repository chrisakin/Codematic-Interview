import express from 'express';
import { AdminController } from '@/controllers/AdminController';
import { AdminService } from '@/services/AdminService';
import { authenticate, authorize } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { 
  RetryFailedJobsDto, 
  CleanQueueDto, 
  GetTopUsersDto, 
  GetTransactionTrendsDto, 
  GetFraudAnalyticsDto 
} from '@/dto/admin.dto';

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

/**
 * @swagger
 * /api/admin/top-users:
 *   get:
 *     summary: Get top transacting users
 *     tags: [Admin]
 */
router.get('/top-users', [
  validateDto(GetTopUsersDto, 'query')
], adminController.getTopTransactingUsers);

/**
 * @swagger
 * /api/admin/transaction-trends:
 *   get:
 *     summary: Get transaction trends over time
 *     tags: [Admin]
 */
router.get('/transaction-trends', [
  validateDto(GetTransactionTrendsDto, 'query')
], adminController.getTransactionTrends);

/**
 * @swagger
 * /api/admin/wallet-summary:
 *   get:
 *     summary: Get wallet summary by currency and status
 *     tags: [Admin]
 */
router.get('/wallet-summary', adminController.getWalletSummary);

/**
 * @swagger
 * /api/admin/fraud-analytics:
 *   get:
 *     summary: Get fraud detection analytics
 *     tags: [Admin]
 */
router.get('/fraud-analytics', [
  validateDto(GetFraudAnalyticsDto, 'query')
], adminController.getFraudAnalytics);

export default router;