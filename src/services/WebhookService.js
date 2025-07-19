const axios = require('axios');
const Tenant = require('../models/Tenant');
const Transaction = require('../models/Transaction');
const logger = require('../config/logger');
const { addJob } = require('../jobs/queue');
const { AppError } = require('../utils/errors');

class WebhookService {
  constructor() {
    this.maxRetries = 5;
    this.retryDelays = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 1m, 5m
  }

  async sendWebhook(transactionId, event) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate('tenant', 'settings.webhookUrl name')
        .populate('user', 'firstName lastName email');

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      const tenant = transaction.tenant;
      if (!tenant.settings.webhookUrl) {
        logger.warn(`No webhook URL configured for tenant: ${tenant._id}`);
        return;
      }

      const payload = this.buildWebhookPayload(transaction, event);
      const signature = this.generateSignature(payload, tenant.secretKey);

      const response = await this.sendWebhookRequest(
        tenant.settings.webhookUrl,
        payload,
        signature
      );

      // Update transaction webhook status
      transaction.webhookStatus = 'sent';
      transaction.webhookAttempts += 1;
      transaction.webhookLastAttempt = new Date();
      await transaction.save();

      logger.info(`Webhook sent successfully for transaction: ${transaction.reference}`);
      return response;

    } catch (error) {
      logger.error('Webhook send failed:', error);
      
      // Update transaction and schedule retry if needed
      await this.handleWebhookFailure(transactionId, error);
      throw error;
    }
  }

  async sendWebhookRequest(url, payload, signature, timeout = 10000) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'VirtualWallet/1.0',
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': Date.now().toString()
    };

    const response = await axios.post(url, payload, {
      headers,
      timeout,
      validateStatus: (status) => status >= 200 && status < 300
    });

    return response.data;
  }

  buildWebhookPayload(transaction, event) {
    return {
      event: event,
      data: {
        id: transaction._id,
        reference: transaction.reference,
        type: transaction.type,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        user: {
          id: transaction.user._id,
          email: transaction.user.email,
          firstName: transaction.user.firstName,
          lastName: transaction.user.lastName
        },
        metadata: transaction.metadata,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        processedAt: transaction.processedAt
      },
      timestamp: Date.now()
    };
  }

  generateSignature(payload, secretKey) {
    const crypto = require('crypto');
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secretKey)
      .update(payloadString)
      .digest('hex');
  }

  async handleWebhookFailure(transactionId, error) {
    try {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) return;

      transaction.incrementWebhookAttempt();
      await transaction.save();

      // Schedule retry if attempts < maxRetries
      if (transaction.webhookAttempts < this.maxRetries) {
        const delay = this.retryDelays[transaction.webhookAttempts - 1] || 300000;
        
        await addJob('retryFailedWebhook', {
          transactionId: transactionId
        }, { delay });

        logger.info(`Webhook retry scheduled for transaction: ${transaction.reference}, attempt: ${transaction.webhookAttempts}`);
      } else {
        transaction.webhookStatus = 'failed';
        await transaction.save();
        
        // Notify admin about permanent webhook failure
        await addJob('sendSlackAlert', {
          channel: 'alerts',
          message: `Webhook permanently failed for transaction ${transaction.reference} after ${this.maxRetries} attempts`,
          level: 'error'
        });
      }

    } catch (saveError) {
      logger.error('Failed to handle webhook failure:', saveError);
    }
  }

  async retryWebhook(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      if (transaction.webhookAttempts >= this.maxRetries) {
        throw new AppError('Maximum webhook retry attempts exceeded', 400);
      }

      // Determine event type based on transaction status
      let event = 'transaction.updated';
      if (transaction.status === 'completed') {
        event = 'transaction.completed';
      } else if (transaction.status === 'failed') {
        event = 'transaction.failed';
      }

      await this.sendWebhook(transactionId, event);
      logger.info(`Webhook retry successful for transaction: ${transaction.reference}`);

    } catch (error) {
      logger.error('Webhook retry failed:', error);
      throw error;
    }
  }

  async processIncomingWebhook(provider, payload, signature, tenantId) {
    try {
      const TransactionService = require('./TransactionService');
      
      // Handle webhook using TransactionService
      const result = await TransactionService.handleWebhook(
        provider,
        payload,
        signature,
        tenantId
      );

      if (result.processed) {
        logger.info(`Incoming webhook processed successfully: ${provider}`, {
          transactionId: result.transaction?._id,
          reference: result.transaction?.reference
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to process incoming webhook:', error);
      throw error;
    }
  }

  // Get webhook delivery logs for a transaction
  async getWebhookLogs(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .select('reference webhookStatus webhookAttempts webhookLastAttempt')
        .lean();

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      return {
        reference: transaction.reference,
        status: transaction.webhookStatus,
        attempts: transaction.webhookAttempts,
        lastAttempt: transaction.webhookLastAttempt
      };

    } catch (error) {
      logger.error('Failed to get webhook logs:', error);
      throw error;
    }
  }

  // Replay webhook for a specific transaction
  async replayWebhook(transactionId, event = null) {
    try {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      // Reset webhook status for replay
      transaction.webhookStatus = 'pending';
      transaction.webhookAttempts = 0;
      await transaction.save();

      // Determine event if not specified
      if (!event) {
        event = transaction.status === 'completed' ? 'transaction.completed' : 'transaction.updated';
      }

      await this.sendWebhook(transactionId, event);
      logger.info(`Webhook replayed for transaction: ${transaction.reference}`);

      return { success: true, message: 'Webhook replay initiated' };

    } catch (error) {
      logger.error('Webhook replay failed:', error);
      throw error;
    }
  }

  // Get webhook statistics for a tenant
  async getWebhookStats(tenantId, startDate, endDate) {
    try {
      const matchStage = {
        tenant: tenantId,
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };

      const stats = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$webhookStatus',
            count: { $sum: 1 },
            totalAttempts: { $sum: '$webhookAttempts' }
          }
        }
      ]);

      const result = {
        pending: 0,
        sent: 0,
        failed: 0,
        totalAttempts: 0
      };

      stats.forEach(stat => {
        result[stat._id] = stat.count;
        result.totalAttempts += stat.totalAttempts;
      });

      // Calculate success rate
      const total = result.pending + result.sent + result.failed;
      result.successRate = total > 0 ? (result.sent / total * 100).toFixed(2) : 0;

      return result;

    } catch (error) {
      logger.error('Failed to get webhook stats:', error);
      throw error;
    }
  }
}

module.exports = new WebhookService();