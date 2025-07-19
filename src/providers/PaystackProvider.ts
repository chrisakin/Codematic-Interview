import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import logger from '@/config/logger';
import { AppError } from '@/utils/errors';
import { 
  IPaymentProvider, 
  IPaymentInitData, 
  IPaymentInitResponse, 
  IPaymentVerificationResponse,
  IPayoutData,
  IPayoutResponse,
  IVirtualAccountData,
  IVirtualAccountResponse,
  IWebhookEvent,
  IBank,
  IAccountResolution,
  IProviderConfig
} from '@/types';

class PaystackProvider implements IPaymentProvider {
  private config: IProviderConfig;
  private baseURL: string = 'https://api.paystack.co';
  private client: AxiosInstance;

  constructor(config: IProviderConfig) {
    this.config = config;
    
    if (!config.secretKey) {
      throw new AppError('Paystack secret key is required', 400);
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async initializePayment(data: IPaymentInitData): Promise<IPaymentInitResponse> {
    try {
      const { amount, currency, reference, email, metadata } = data;
      
      const payload = {
        amount: amount, // Paystack expects amount in kobo
        currency: currency,
        email: email,
        reference: reference,
        metadata: metadata,
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money']
      };

      const response = await this.client.post('/transaction/initialize', payload);
      
      if (!response.data.status) {
        throw new AppError(`Paystack initialization failed: ${response.data.message}`, 400);
      }

      return {
        reference: response.data.data.reference,
        authorizationUrl: response.data.data.authorization_url,
        accessCode: response.data.data.access_code,
        provider: 'paystack',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Paystack payment initialization failed:', error);
      if (error.response) {
        throw new AppError(`Paystack error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async verifyPayment(reference: string): Promise<IPaymentVerificationResponse> {
    try {
      const response = await this.client.get(`/transaction/verify/${reference}`);
      
      if (!response.data.status) {
        throw new AppError(`Payment verification failed: ${response.data.message}`, 400);
      }

      const transaction = response.data.data;
      
      return {
        reference: transaction.reference,
        status: transaction.status === 'success' ? 'completed' : 'failed',
        amount: transaction.amount,
        currency: transaction.currency,
        paidAt: transaction.paid_at,
        channel: transaction.channel,
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Paystack payment verification failed:', error);
      if (error.response) {
        throw new AppError(`Paystack error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async initiatePayout(data: IPayoutData): Promise<IPayoutResponse> {
    try {
      const { amount, currency, reference, bankDetails } = data;
      
      // First, create a transfer recipient
      const recipientPayload = {
        type: 'nuban',
        name: bankDetails.accountName,
        account_number: bankDetails.accountNumber,
        bank_code: bankDetails.bankCode,
        currency: currency
      };

      const recipientResponse = await this.client.post('/transferrecipient', recipientPayload);
      
      if (!recipientResponse.data.status) {
        throw new AppError(`Recipient creation failed: ${recipientResponse.data.message}`, 400);
      }

      const recipientCode = recipientResponse.data.data.recipient_code;

      // Initiate transfer
      const transferPayload = {
        source: 'balance',
        amount: amount,
        recipient: recipientCode,
        reason: `Withdrawal: ${reference}`,
        reference: reference
      };

      const transferResponse = await this.client.post('/transfer', transferPayload);
      
      if (!transferResponse.data.status) {
        throw new AppError(`Transfer failed: ${transferResponse.data.message}`, 400);
      }

      return {
        reference: transferResponse.data.data.reference,
        status: 'pending',
        provider: 'paystack',
        providerResponse: transferResponse.data
      };
      
    } catch (error: any) {
      logger.error('Paystack payout failed:', error);
      if (error.response) {
        throw new AppError(`Paystack error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async createVirtualAccount(data: IVirtualAccountData): Promise<IVirtualAccountResponse> {
    try {
      const { customerId, preferredBank } = data;
      
      const payload = {
        customer: customerId,
        preferred_bank: preferredBank || 'wema-bank'
      };

      const response = await this.client.post('/dedicated_account', payload);
      
      if (!response.data.status) {
        throw new AppError(`Virtual account creation failed: ${response.data.message}`, 400);
      }

      const account = response.data.data;
      
      return {
        accountNumber: account.account_number,
        accountName: account.account_name,
        bankName: account.bank.name,
        bankCode: account.bank.code,
        provider: 'paystack',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Paystack virtual account creation failed:', error);
      if (error.response) {
        throw new AppError(`Paystack error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    try {
      if (!this.config.webhookSecret) {
        logger.warn('Webhook secret not configured for Paystack');
        return false;
      }
      
      const hash = crypto
        .createHmac('sha512', this.config.webhookSecret!)
        .update(JSON.stringify(payload))
        .digest('hex');

      return hash === signature;
    } catch (error) {
      logger.error('Webhook verification failed:', error);
      return false;
    }
  }

  parseWebhookEvent(payload: any): IWebhookEvent {
    const { event, data } = payload;
    
    let status: 'success' | 'failed' | 'pending';
    switch (data.status) {
      case 'success':
        status = 'success';
        break;
      case 'failed':
        status = 'failed';
        break;
      default:
        status = 'pending';
    }

    return {
      event: event,
      reference: data.reference,
      status: status,
      amount: data.amount,
      currency: data.currency,
      customer: data.customer,
      providerData: data
    };
  }

  async getBanks(): Promise<IBank[]> {
    try {
      const response = await this.client.get('/bank');
      
      if (!response.data.status) {
        throw new AppError('Failed to fetch banks', 400);
      }

      return response.data.data.map((bank: any) => ({
        name: bank.name,
        code: bank.code,
        slug: bank.slug,
        provider: 'paystack' as const
      }));
      
    } catch (error) {
      logger.error('Failed to fetch banks:', error);
      throw error;
    }
  }

  async resolveAccountNumber(accountNumber: string, bankCode: string): Promise<IAccountResolution> {
    try {
      const response = await this.client.get(
        `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
      );
      
      if (!response.data.status) {
        throw new AppError('Account resolution failed', 400);
      }

      return {
        accountNumber: response.data.data.account_number,
        accountName: response.data.data.account_name,
        bankCode: bankCode
      };
      
    } catch (error: any) {
      logger.error('Account resolution failed:', error);
      if (error.response) {
        throw new AppError(`Paystack error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }
}

export default PaystackProvider;