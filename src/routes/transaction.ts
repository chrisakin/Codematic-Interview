import express from 'express';
import { TransactionController } from '@/controllers/TransactionController';
import { TransactionService } from '@/services/TransactionService';
import { authenticate, requireVerification, checkTransactionPermissions } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { 
  InitializeTransactionDto, 
  GetTransactionHistoryDto,
  GetTransactionStatsDto 
} from '@/dto/transaction.dto';

const router = express.Router();

// Apply authentication to all transaction routes
router.use(authenticate);

// Initialize services and controller
const transactionService = new TransactionService();
const transactionController = new TransactionController(transactionService);

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Initialize a new transaction
 *     tags: [Transactions]
 */
router.post('/', [
  validateDto(InitializeTransactionDto)
], transactionController.initializeTransaction);

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get transaction history
 *     tags: [Transactions]
 */
router.get('/', [
  validateDto(GetTransactionHistoryDto, 'query')
], transactionController.getTransactionHistory);

/**
 * @swagger
 * /api/transactions/stats:
 *   get:
 *     summary: Get transaction statistics
 *     tags: [Transactions]
 */
router.get('/stats', [
  validateDto(GetTransactionStatsDto, 'query')
], transactionController.getTransactionStats);

/**
 * @swagger
 * /api/transactions/{reference}:
 *   get:
 *     summary: Get transaction by reference
 *     tags: [Transactions]
 */
router.get('/:reference', transactionController.getTransactionByReference);

/**
 * @swagger
 * /api/transactions/{transactionId}/retry:
 *   post:
 *     summary: Retry a failed transaction
 *     tags: [Transactions]
 */
router.post('/:transactionId/retry', [
  requireVerification,
  checkTransactionPermissions
], transactionController.retryTransaction);

/**
 * @swagger
 * /api/transactions/process/{transactionId}:
 *   post:
 *     summary: Process a pending transaction
 *     tags: [Transactions]
 */
router.post('/process/:transactionId', [
  requireVerification
], transactionController.processTransaction);

export default router;