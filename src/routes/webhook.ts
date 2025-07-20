import express, { Request, Response, NextFunction } from 'express';
import { WebhookController } from '@/controllers/WebhookController';
import WebhookService from '@/services/WebhookService';
import { TransactionService } from '@/services/TransactionService';
import { authenticateWebhook, authenticate } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { ReplayWebhookDto } from '@/dto/webhook.dto';

const router = express.Router();

/**
 * @swagger
 * /api/webhooks/paystack:
 *   post:
 *     summary: Handle Paystack webhook
 *     tags: [Webhooks]
 */
router.post('/paystack', [
  authenticateWebhook
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookService = new WebhookService();
    const transactionService = new TransactionService();
    const webhookController = new WebhookController(webhookService, transactionService);
    await webhookController.handlePaystackWebhook(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/webhooks/flutterwave:
 *   post:
 *     summary: Handle Flutterwave webhook
 *     tags: [Webhooks]
 */
router.post('/flutterwave', [
  authenticateWebhook
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookService = new WebhookService();
    const transactionService = new TransactionService();
    const webhookController = new WebhookController(webhookService, transactionService);
    await webhookController.handleFlutterwaveWebhook(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/webhooks/stripe:
 *   post:
 *     summary: Handle Stripe webhook
 *     tags: [Webhooks]
 */
router.post('/stripe', [
  authenticateWebhook
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookService = new WebhookService();
    const transactionService = new TransactionService();
    const webhookController = new WebhookController(webhookService, transactionService);
    await webhookController.handleStripeWebhook(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/webhooks/replay/{transactionId}:
 *   post:
 *     summary: Replay webhook for a transaction
 *     tags: [Webhooks]
 */
router.post('/replay/:transactionId', [
  authenticate,
  validateDto(ReplayWebhookDto)
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookService = new WebhookService();
    const transactionService = new TransactionService();
    const webhookController = new WebhookController(webhookService, transactionService);
    await webhookController.replayWebhook(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/webhooks/logs/{transactionId}:
 *   get:
 *     summary: Get webhook delivery logs
 *     tags: [Webhooks]
 */
router.get('/logs/:transactionId', [
  authenticate
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookService = new WebhookService();
    const transactionService = new TransactionService();
    const webhookController = new WebhookController(webhookService, transactionService);
    await webhookController.getWebhookLogs(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/webhooks/stats:
 *   get:
 *     summary: Get webhook statistics
 *     tags: [Webhooks]
 */
router.get('/stats', [
  authenticate
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookService = new WebhookService();
    const transactionService = new TransactionService();
    const webhookController = new WebhookController(webhookService, transactionService);
    await webhookController.getWebhookStats(req, res, next);
  } catch (err) {
    next(err);
  }
});

export default router;