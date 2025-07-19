import axios from 'axios';
import Tenant from '@/models/Tenant';
import Transaction from '@/models/Transaction';
import logger from '@/config/logger';
import { addJobSimple as addJob } from '@/jobs/queue';
import { AppError } from '@/utils/errors';
import { ITransaction, ITenant, IUser, IWebhookPayload, ITransactionStats } from '@/types';
import { Types } from 'mongoose';
import crypto from 'crypto';

class WebhookService {
  private maxRetries: number = 5;
  private retryDelays: number[] = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 1m, 5m

  async sendWebhook(transactionId: string, event: string): Promise<any> {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate('tenant', 'settings.webhookUrl name')
        .populate('user', 'firstName lastName email') as ITransaction;

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      const tenant = transaction.tenant as ITenant;
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
      await this.handleWebhookFailure(transactionId, error as Error);
      throw error;
    }
  }

  async sendWebhookRequest(url: string, payload: IWebhookPayload, signature: string, timeout: number = 10000): Promise<any> {
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

  buildWebhookPayload(transaction: ITransaction, event: string): IWebhookPayload {
    const user = transaction.user as IUser;
    
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
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        metadata: transaction.metadata,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        processedAt: transaction.processedAt
      },
      timestamp: Date.now()
    };
  }

  generateSignature(payload: IWebhookPayload, secretKey: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secretKey)
      .update(payloadString)
      .digest('hex');
  }

  async handleWebhookFailure(transactionId: string, error: Error): Promise<void> {
    try {
      const transaction = await Transaction.findById(transactionId) as ITransaction;
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

  async retryWebhook(transactionId: string): Promise<void> {
    try {
      const transaction = await Transaction.findById(transactionId) as ITransaction;
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

  async processIncomingWebhook(provider: string, payload: any, signature: string, tenantId: string): Promise<any> {
    try {
      const { default: TransactionService } = await import('./TransactionService');
      
      // Handle webhook using TransactionService
      const result = await TransactionService.handleWebhook(
        provider as any,
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
  async getWebhookLogs(transactionId: string): Promise<any> {
    try {
      const transaction = await Transaction.findById(transactionId)
        .select('reference webhookStatus webhookAttempts webhookLastAttempt')
        .lean() as ITransaction;

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
  async replayWebhook(transactionId: string, event?: string): Promise<{ success: boolean; message: string }> {
    try {
      const transaction = await Transaction.findById(transactionId) as ITransaction;
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
  async getWebhookStats(tenantId: Types.ObjectId, startDate: string, endDate: string): Promise<ITransactionStats> {
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

      const result: ITransactionStats = {
        pending: 0,
        sent: 0,
        failed: 0,
        totalAttempts: 0,
        successRate: '0'
      };

      stats.forEach(stat => {
        (result as any)[stat._id] = stat.count;
        result.totalAttempts += stat.totalAttempts;
      });

      // Calculate success rate
      const total = result.pending + result.sent + result.failed;
      result.successRate = total > 0 ? (result.sent / total * 100).toFixed(2) : '0';

      return result;

    } catch (error) {
      logger.error('Failed to get webhook stats:', error);
      throw error;
    }
  }
}

export default new WebhookService();