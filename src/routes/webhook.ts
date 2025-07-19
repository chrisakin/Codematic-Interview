import express, { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

import TransactionService from '@/services/TransactionService';
import WebhookService from '@/services/WebhookService';
import { authenticateApiKey, authenticateWebhook, authenticate } from '@/middleware/auth';
import { AppError, catchAsync } from '@/utils/errors';
import logger from '@/config/logger';
import { IAuthenticatedRequest } from '@/types';

const router = express.Router();

/**
 * @swagger
 * /api/webhooks/paystack:
 *   post:
 *     summary: Handle Paystack webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: x-paystack-signature
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: tenant_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/paystack', [
  authenticateWebhook
], catchAsync(async (req: Request, res: Response) => {
  const { tenant_id } = req.query;
  const signature = req.headers['x-paystack-signature'] as string;
  
  if (!tenant_id) {
    throw new AppError('Tenant ID required', 400);
  }

  const result = await TransactionService.handleWebhook(
    'paystack',
    req.body,
    signature,
    tenant_id as string
  );

  logger.info('Paystack webhook processed', { result });

  res.status(200).json({
    status: 'success',
    message: 'Webhook processed successfully'
  });
}));

/**
 * @swagger
 * /api/webhooks/flutterwave:
 *   post:
 *     summary: Handle Flutterwave webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: verif-hash
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: tenant_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/flutterwave', [
  authenticateWebhook
], catchAsync(async (req: Request, res: Response) => {
  const { tenant_id } = req.query;
  const signature = req.headers['verif-hash'] as string;
  
  if (!tenant_id) {
    throw new AppError('Tenant ID required', 400);
  }

  const result = await TransactionService.handleWebhook(
    'flutterwave',
    req.body,
    signature,
    tenant_id as string
  );

  logger.info('Flutterwave webhook processed', { result });

  res.status(200).json({
    status: 'success',
    message: 'Webhook processed successfully'
  });
}));

/**
 * @swagger
 * /api/webhooks/stripe:
 *   post:
 *     summary: Handle Stripe webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: tenant_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/stripe', [
  authenticateWebhook
], catchAsync(async (req: Request, res: Response) => {
  const { tenant_id } = req.query;
  const signature = req.headers['stripe-signature'] as string;
  
  if (!tenant_id) {
    throw new AppError('Tenant ID required', 400);
  }

  const result = await TransactionService.handleWebhook(
    'stripe',
    req.body,
    signature,
    tenant_id as string
  );

  logger.info('Stripe webhook processed', { result });

  res.status(200).json({
    status: 'success',
    message: 'Webhook processed successfully'
  });
}));

/**
 * @swagger
 * /api/webhooks/replay/{transactionId}:
 *   post:
 *     summary: Replay webhook for a transaction
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 description: Event type to replay
 *     responses:
 *       200:
 *         description: Webhook replay initiated successfully
 */
router.post('/replay/:transactionId', [
  authenticate,
  param('transactionId').isMongoId().withMessage('Valid transaction ID required')
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { transactionId } = req.params;
  const { event } = req.body;

  const result = await WebhookService.replayWebhook(transactionId, event);

  res.json({
    status: 'success',
    message: 'Webhook replay initiated successfully',
    data: result
  });
}));

/**
 * @swagger
 * /api/webhooks/logs/{transactionId}:
 *   get:
 *     summary: Get webhook delivery logs for a transaction
 *     tags: [Webhooks]
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
 *         description: Webhook logs retrieved successfully
 */
router.get('/logs/:transactionId', [
  authenticate,
  param('transactionId').isMongoId().withMessage('Valid transaction ID required')
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { transactionId } = req.params;

  const logs = await WebhookService.getWebhookLogs(transactionId);

  res.json({
    status: 'success',
    data: { logs }
  });
}));

/**
 * @swagger
 * /api/webhooks/stats:
 *   get:
 *     summary: Get webhook statistics for tenant
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Webhook statistics retrieved successfully
 */
router.get('/stats', [
  authenticate
], catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    throw new AppError('Start date and end date are required', 400);
  }

  const stats = await WebhookService.getWebhookStats(
    req.tenant._id,
    startDate as string,
    endDate as string
  );

  res.json({
    status: 'success',
    data: { stats }
  });
}));

export default router;