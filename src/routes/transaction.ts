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

// Do NOT instantiate TransactionService at the top level!
// Instead, instantiate inside each route handler

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Initialize a new transaction
 *     tags: [Transactions]
 */
router.post('/', [
  validateDto(InitializeTransactionDto)
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const transactionService = new TransactionService();
    const transactionController = new TransactionController(transactionService);
    await transactionController.initializeTransaction(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get transaction history
 *     tags: [Transactions]
 */
router.get('/', [
  validateDto(GetTransactionHistoryDto, 'query')
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const transactionService = new TransactionService();
    const transactionController = new TransactionController(transactionService);
    await transactionController.getTransactionHistory(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/transactions/stats:
 *   get:
 *     summary: Get transaction statistics
 *     tags: [Transactions]
 */
router.get('/stats', [
  validateDto(GetTransactionStatsDto, 'query')
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const transactionService = new TransactionService();
    const transactionController = new TransactionController(transactionService);
    await transactionController.getTransactionStats(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/transactions/{reference}:
 *   get:
 *     summary: Get transaction by reference
 *     tags: [Transactions]
 */
router.get('/:reference', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const transactionService = new TransactionService();
    const transactionController = new TransactionController(transactionService);
    await transactionController.getTransactionByReference(req, res, next);
  } catch (err) {
    next(err);
  }
});

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
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const transactionService = new TransactionService();
    const transactionController = new TransactionController(transactionService);
    await transactionController.retryTransaction(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/transactions/process/{transactionId}:
 *   post:
 *     summary: Process a pending transaction
 *     tags: [Transactions]
 */
router.post('/process/:transactionId', [
  requireVerification
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const transactionService = new TransactionService();
    const transactionController = new TransactionController(transactionService);
    await transactionController.processTransaction(req, res, next);
  } catch (err) {
    next(err);
  }
});

export default router;