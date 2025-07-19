import express, { Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';

import TransactionService from '@/services/TransactionService';
import { authenticate, requireVerification, checkTransactionPermissions } from '@/middleware/auth';
import { AppError, catchAsync } from '@/utils/errors';
import logger from '@/config/logger';
import { IAuthenticatedRequest, TransactionType, TransactionStatus, Currency, PaymentMethod } from '@/types';
import Transaction from '@/models/Transaction';

const router = express.Router();

// Apply authentication to all transaction routes
router.use(authenticate);

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Initialize a new transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - amount
 *               - currency
 *               - description
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [deposit, withdrawal, transfer]
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               currency:
 *                 type: string
 *                 enum: [NGN, USD, GBP, EUR]
 *               description:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *                 enum: [card, bank_transfer, mobile_money, virtual_account, wallet]
 *               provider:
 *                 type: string
 *                 enum: [paystack, flutterwave, stripe]
 *               metadata:
 *                 type: object
 *               idempotencyKey:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transaction initialized successfully
 */
router.post('/', [
  body('type').isIn(['deposit', 'withdrawal', 'transfer']).withMessage('Invalid transaction type'),
  body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('currency').isIn(['NGN', 'USD', 'GBP', 'EUR']).withMessage('Invalid currency'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('paymentMethod').optional().isIn(['card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet']),
  body('provider').optional().isIn(['paystack', 'flutterwave', 'stripe']),
  body('idempotencyKey').optional().isString()
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { type, amount, currency, description, paymentMethod, provider, metadata, idempotencyKey } = req.body;

  // Convert to minor currency unit (cents/kobo)
  const amountInMinor = Math.round(amount * 100);

  const transactionData = {
    tenantId: req.tenant._id,
    userId: req.user._id,
    type: type as TransactionType,
    amount: amountInMinor,
    currency: currency as Currency,
    description,
    paymentMethod: (paymentMethod || 'card') as PaymentMethod,
    metadata: {
      ...metadata,
      clientIp: req.ip,
      userAgent: req.get('User-Agent')
    },
    idempotencyKey
  };

  const transaction = await TransactionService.initializeTransaction(transactionData);

  res.status(201).json({
    status: 'success',
    message: 'Transaction initialized successfully',
    data: { transaction }
  });
}));

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get transaction history
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, transfer, fee, refund]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  query('type').optional().isIn(['deposit', 'withdrawal', 'transfer', 'fee', 'refund']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { page, limit, status, type, startDate, endDate } = req.query;

  const filters = {
    tenantId: req.tenant._id,
    userId: req.user._id,
    status: status as TransactionStatus,
    type: type as TransactionType,
    startDate: startDate as string,
    endDate: endDate as string
  };

  const pagination = { 
    page: page ? Number(page) : undefined, 
    limit: limit ? Number(limit) : undefined 
  };

  const result = await TransactionService.getTransactionHistory(filters, pagination);

  res.json({
    status: 'success',
    data: result
  });
}));

/**
 * @swagger
 * /api/transactions/{reference}:
 *   get:
 *     summary: Get transaction by reference
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 */
router.get('/:reference', [
  param('reference').isString().withMessage('Transaction reference is required')
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { reference } = req.params;

  const transaction = await TransactionService.getTransactionByReference(reference, req.tenant._id);

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  // Check if user owns the transaction
  if (transaction.user?._id.toString() !== req.user._id.toString()) {
    throw new AppError('Access denied', 403);
  }

  res.json({
    status: 'success',
    data: { transaction }
  });
}));

/**
 * @swagger
 * /api/transactions/{transactionId}/retry:
 *   post:
 *     summary: Retry a failed transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction retry initiated successfully
 */
router.post('/:transactionId/retry', [
  requireVerification,
  checkTransactionPermissions
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const { transactionId } = req.params;

  const transaction = await TransactionService.retryFailedTransaction(transactionId);

  res.json({
    status: 'success',
    message: 'Transaction retry initiated successfully',
    data: { transaction }
  });
}));

/**
 * @swagger
 * /api/transactions/process/{transactionId}:
 *   post:
 *     summary: Process a pending transaction (admin only)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction processed successfully
 */
router.post('/process/:transactionId', [
  requireVerification,
  param('transactionId').isMongoId().withMessage('Valid transaction ID required')
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const { transactionId } = req.params;

  // Check if user has admin role (you might want to add this to auth middleware)
  if ((req.user as any).role !== 'admin') {
    throw new AppError('Admin access required', 403);
  }

  const result = await TransactionService.processTransaction(transactionId);

  res.json({
    status: 'success',
    message: 'Transaction processed successfully',
    data: result
  });
}));

/**
 * @swagger
 * /api/transactions/stats:
 *   get:
 *     summary: Get transaction statistics
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Transaction statistics retrieved successfully
 */
router.get('/stats', [
  query('period').optional().isIn(['today', 'week', 'month', 'year'])
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const { period = 'month' } = req.query;

  // Calculate date range based on period
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const stats = await Transaction.aggregate([
    {
      $match: {
        user: req.user._id,
        tenant: req.tenant._id,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          status: '$status',
          type: '$type'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.status',
        types: {
          $push: {
            type: '$_id.type',
            count: '$count',
            totalAmount: '$totalAmount'
          }
        },
        totalCount: { $sum: '$count' },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);

  res.json({
    status: 'success',
    data: {
      period,
      stats,
      generatedAt: new Date()
    }
  });
}));

export default router;