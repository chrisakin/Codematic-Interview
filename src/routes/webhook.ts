import express from 'express';
import { WebhookController } from '@/controllers/WebhookController';
import { WebhookService } from '@/services/WebhookService';
import { TransactionService } from '@/services/TransactionService';
import { authenticateWebhook, authenticate } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { ReplayWebhookDto } from '@/dto/webhook.dto';

const router = express.Router();

// Initialize services and controller
const webhookService = new WebhookService();
const transactionService = new TransactionService();
const webhookController = new WebhookController(webhookService, transactionService);

/**
 * @swagger
 * /api/webhooks/paystack:
 *   post:
 *     summary: Handle Paystack webhook
 *     tags: [Webhooks]
 */
router.post('/paystack', [
  authenticateWebhook
], webhookController.handlePaystackWebhook);

/**
 * @swagger
 * /api/webhooks/flutterwave:
 *   post:
 *     summary: Handle Flutterwave webhook
 *     tags: [Webhooks]
 */
router.post('/flutterwave', [
  authenticateWebhook
], webhookController.handleFlutterwaveWebhook);

/**
 * @swagger
 * /api/webhooks/stripe:
 *   post:
 *     summary: Handle Stripe webhook
 *     tags: [Webhooks]
 */
router.post('/stripe', [
  authenticateWebhook
], webhookController.handleStripeWebhook);

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
], webhookController.replayWebhook);

/**
 * @swagger
 * /api/webhooks/logs/{transactionId}:
 *   get:
 *     summary: Get webhook delivery logs
 *     tags: [Webhooks]
 */
router.get('/logs/:transactionId', [
  authenticate
], webhookController.getWebhookLogs);

/**
 * @swagger
 * /api/webhooks/stats:
 *   get:
 *     summary: Get webhook statistics
 *     tags: [Webhooks]
 */
router.get('/stats', [
  authenticate
], webhookController.getWebhookStats);

export default router;