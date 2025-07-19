import logger from '@/config/logger';
import { AppError } from '@/utils/errors';
import { INotificationData, INotificationResult, IUser } from '@/types';
import User from '@/models/User';
import { Types } from 'mongoose';

class NotificationService {
  private emailEnabled: boolean;
  private smsEnabled: boolean;
  private pushEnabled: boolean;
  private slackEnabled: boolean;

  constructor() {
    this.emailEnabled = process.env.EMAIL_ENABLED === 'true';
    this.smsEnabled = process.env.SMS_ENABLED === 'true';
    this.pushEnabled = process.env.PUSH_ENABLED === 'true';
    this.slackEnabled = process.env.SLACK_ENABLED === 'true';
  }

  async sendEmail(to: string, subject: string, template: string, data: any): Promise<INotificationResult> {
    try {
      if (!this.emailEnabled) {
        logger.info('Email service disabled, skipping email send');
        return { success: true, message: 'Email service disabled', provider: 'disabled' };
      }

      // Mock email service - replace with actual email provider
      const emailContent = this.renderEmailTemplate(template, data);
      
      logger.info('Email sent successfully', {
        to,
        subject,
        template
      });

      // In production, integrate with services like:
      // - SendGrid
      // - Amazon SES
      // - Mailgun
      // - Postmark

      return {
        success: true,
        messageId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider: 'mock'
      };

    } catch (error) {
      logger.error('Email send failed:', error);
      throw new AppError('Failed to send email notification', 500);
    }
  }

  async sendSMS(to: string, message: string): Promise<INotificationResult> {
    try {
      if (!this.smsEnabled) {
        logger.info('SMS service disabled, skipping SMS send');
        return { success: true, message: 'SMS service disabled', provider: 'disabled' };
      }

      // Mock SMS service - replace with actual SMS provider
      logger.info('SMS sent successfully', {
        to,
        message: message.substring(0, 50) + '...'
      });

      // In production, integrate with services like:
      // - Twilio
      // - Amazon SNS
      // - Vonage (Nexmo)
      // - Africa's Talking

      return {
        success: true,
        messageId: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider: 'mock'
      };

    } catch (error) {
      logger.error('SMS send failed:', error);
      throw new AppError('Failed to send SMS notification', 500);
    }
  }

  async sendPushNotification(userId: Types.ObjectId, title: string, body: string, data: any = {}): Promise<INotificationResult> {
    try {
      if (!this.pushEnabled) {
        logger.info('Push notification service disabled, skipping push send');
        return { success: true, message: 'Push notification service disabled', provider: 'disabled' };
      }

      // Mock push notification service - replace with actual push provider
      logger.info('Push notification sent successfully', {
        userId,
        title,
        body: body.substring(0, 50) + '...'
      });

      // In production, integrate with services like:
      // - Firebase Cloud Messaging (FCM)
      // - Apple Push Notification Service (APNs)
      // - OneSignal
      // - Pusher

      return {
        success: true,
        messageId: `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider: 'mock'
      };

    } catch (error) {
      logger.error('Push notification send failed:', error);
      throw new AppError('Failed to send push notification', 500);
    }
  }

  async sendSlackAlert(channel: string, message: string, level: string = 'info'): Promise<INotificationResult> {
    try {
      if (!this.slackEnabled) {
        logger.info('Slack service disabled, skipping Slack alert');
        return { success: true, message: 'Slack service disabled', provider: 'disabled' };
      }

      // Mock Slack service - replace with actual Slack webhook
      const color = this.getSlackColor(level);
      
      logger.info('Slack alert sent successfully', {
        channel,
        level,
        message: message.substring(0, 100) + '...'
      });

      // In production, integrate with Slack Incoming Webhooks:
      // const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
      // await webhook.send({
      //   channel: channel,
      //   text: message,
      //   attachments: [
      //     {
      //       color: color,
      //       text: message,
      //       ts: Math.floor(Date.now() / 1000)
      //     }
      //   ]
      // });

      return {
        success: true,
        messageId: `slack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider: 'mock'
      };

    } catch (error) {
      logger.error('Slack alert send failed:', error);
      throw new AppError('Failed to send Slack alert', 500);
    }
  }

  renderEmailTemplate(template: string, data: any): { subject: string; html: string } {
    // Mock template rendering - replace with actual template engine
    const templates: Record<string, { subject: string; html: string }> = {
      'transaction-completed': {
        subject: 'Transaction Completed',
        html: `
          <h2>Transaction Completed</h2>
          <p>Your transaction has been completed successfully.</p>
          <p><strong>Reference:</strong> ${data.reference}</p>
          <p><strong>Amount:</strong> ${data.currency} ${(data.amount / 100).toFixed(2)}</p>
          <p><strong>Status:</strong> ${data.status}</p>
        `
      },
      'transaction-failed': {
        subject: 'Transaction Failed',
        html: `
          <h2>Transaction Failed</h2>
          <p>Unfortunately, your transaction could not be completed.</p>
          <p><strong>Reference:</strong> ${data.reference}</p>
          <p><strong>Amount:</strong> ${data.currency} ${(data.amount / 100).toFixed(2)}</p>
          <p><strong>Reason:</strong> ${data.reason || 'Unknown error'}</p>
        `
      },
      'wallet-credited': {
        subject: 'Wallet Credited',
        html: `
          <h2>Wallet Credited</h2>
          <p>Your wallet has been credited.</p>
          <p><strong>Amount:</strong> ${data.currency} ${(data.amount / 100).toFixed(2)}</p>
          <p><strong>New Balance:</strong> ${data.currency} ${(data.newBalance / 100).toFixed(2)}</p>
        `
      },
      'security-alert': {
        subject: 'Security Alert',
        html: `
          <h2>Security Alert</h2>
          <p>We detected suspicious activity on your account.</p>
          <p><strong>Activity:</strong> ${data.activity}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
          <p><strong>IP Address:</strong> ${data.ipAddress}</p>
          <p>If this wasn't you, please contact support immediately.</p>
        `
      }
    };

    return templates[template] || {
      subject: 'Notification',
      html: '<p>You have a new notification.</p>'
    };
  }

  getSlackColor(level: string): string {
    const colors: Record<string, string> = {
      info: '#36a64f',     // Green
      warning: '#ff9900',   // Orange
      error: '#ff0000',     // Red
      success: '#36a64f'    // Green
    };
    return colors[level] || colors.info;
  }

  // Send transaction notification based on status
  async sendTransactionNotification(transaction: any, user: IUser): Promise<{ email: boolean; sms: boolean; push: boolean }> {
    try {
      const { type, status, amount, currency, reference } = transaction;
      
      // Determine notification content based on transaction status
      let template: string, smsMessage: string, pushTitle: string, pushBody: string;
      
      switch (status) {
        case 'completed':
          template = type === 'deposit' ? 'wallet-credited' : 'transaction-completed';
          smsMessage = `Transaction ${reference} completed. Amount: ${currency} ${(amount / 100).toFixed(2)}`;
          pushTitle = 'Transaction Completed';
          pushBody = `Your ${type} of ${currency} ${(amount / 100).toFixed(2)} was successful`;
          break;
          
        case 'failed':
          template = 'transaction-failed';
          smsMessage = `Transaction ${reference} failed. Please try again or contact support.`;
          pushTitle = 'Transaction Failed';
          pushBody = `Your ${type} of ${currency} ${(amount / 100).toFixed(2)} was unsuccessful`;
          break;
          
        default:
          // Don't send notifications for pending/processing transactions
          return { email: false, sms: false, push: false };
      }

      const emailData = {
        reference,
        amount,
        currency,
        status,
        type,
        newBalance: (user as any).wallet?.balance || 0
      };

      // Send notifications in parallel
      const notifications = await Promise.allSettled([
        this.sendEmail(user.email, '', template, emailData),
        this.sendSMS(user.phoneNumber || '', smsMessage),
        this.sendPushNotification(user._id, pushTitle, pushBody, {
          transactionId: transaction._id,
          reference,
          type: 'transaction'
        })
      ]);

      // Log notification results
      notifications.forEach((result, index) => {
        const notificationType = ['email', 'sms', 'push'][index];
        if (result.status === 'fulfilled') {
          logger.info(`${notificationType} notification sent for transaction ${reference}`);
        } else {
          logger.error(`${notificationType} notification failed for transaction ${reference}:`, result.reason);
        }
      });

      return {
        email: notifications[0].status === 'fulfilled',
        sms: notifications[1].status === 'fulfilled',
        push: notifications[2].status === 'fulfilled'
      };

    } catch (error) {
      logger.error('Failed to send transaction notifications:', error);
      throw error;
    }
  }

  // Send security alert
  async sendSecurityAlert(user: IUser, activity: string, metadata: any = {}): Promise<void> {
    try {
      const alertData = {
        activity,
        timestamp: Date.now(),
        ipAddress: metadata.ipAddress || 'Unknown',
        userAgent: metadata.userAgent || 'Unknown'
      };

      await Promise.allSettled([
        this.sendEmail(user.email, '', 'security-alert', alertData),
        this.sendPushNotification(user._id, 'Security Alert', 
          `Suspicious activity detected: ${activity}`, {
            type: 'security',
            activity,
            timestamp: alertData.timestamp
          })
      ]);

      logger.info(`Security alert sent to user ${user._id}: ${activity}`);

    } catch (error) {
      logger.error('Failed to send security alert:', error);
      throw error;
    }
  }

  // Send bulk notifications (for admin use)
  async sendBulkNotification(
    userIds: Types.ObjectId[], 
    type: 'email' | 'sms' | 'push', 
    subject: string, 
    message: string, 
    data: any = {}
  ): Promise<{ total: number; successful: number; failed: number; errors: any[] }> {
    try {
      const users = await User.find({ _id: { $in: userIds } })
        .select('email phoneNumber firstName lastName')
        .lean() as IUser[];

      const results = {
        total: users.length,
        successful: 0,
        failed: 0,
        errors: [] as any[]
      };

      for (const user of users) {
        try {
          switch (type) {
            case 'email':
              await this.sendEmail(user.email, subject, 'custom', { message, ...data });
              break;
            case 'sms':
              await this.sendSMS(user.phoneNumber || '', message);
              break;
            case 'push':
              await this.sendPushNotification(user._id, subject, message, data);
              break;
          }
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: user._id,
            email: user.email,
            error: (error as Error).message
          });
        }
      }

      logger.info(`Bulk notification completed: ${results.successful}/${results.total} successful`);
      return results;

    } catch (error) {
      logger.error('Bulk notification failed:', error);
      throw error;
    }
  }
}

export default new NotificationService();