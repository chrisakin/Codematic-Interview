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

class FlutterwaveProvider implements IPaymentProvider {
  private config: IProviderConfig;
  private baseURL: string = 'https://api.flutterwave.com/v3';
  private client: AxiosInstance;

  constructor(config: IProviderConfig) {
    this.config = config;
    
    if (!config.secretKey) {
      throw new AppError('Flutterwave secret key is required', 400);
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
        tx_ref: reference,
        amount: amount / 100, // Flutterwave expects amount in major currency unit
        currency: currency,
        redirect_url: process.env.FLUTTERWAVE_CALLBACK_URL,
        customer: {
          email: email,
          name: metadata?.customerName || email
        },
        customizations: {
          title: 'Payment',
          description: 'Wallet funding',
          logo: process.env.LOGO_URL
        },
        meta: metadata
      };

      const response = await this.client.post('/payments', payload);
      
      if (response.data.status !== 'success') {
        throw new AppError(`Flutterwave initialization failed: ${response.data.message}`, 400);
      }

      return {
        reference: reference,
        authorizationUrl: response.data.data.link,
        provider: 'flutterwave',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Flutterwave payment initialization failed:', error);
      if (error.response) {
        throw new AppError(`Flutterwave error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async verifyPayment(transactionId: string): Promise<IPaymentVerificationResponse> {
    try {
      const response = await this.client.get(`/transactions/${transactionId}/verify`);
      
      if (response.data.status !== 'success') {
        throw new AppError(`Payment verification failed: ${response.data.message}`, 400);
      }

      const transaction = response.data.data;
      
      return {
        reference: transaction.tx_ref,
        status: transaction.status === 'successful' ? 'completed' : 'failed',
        amount: transaction.amount * 100,
        currency: transaction.currency,
        paidAt: transaction.created_at,
        channel: transaction.payment_type,
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Flutterwave payment verification failed:', error);
      if (error.response) {
        throw new AppError(`Flutterwave error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async initiatePayout(data: IPayoutData): Promise<IPayoutResponse> {
    try {
      const { amount, currency, reference, bankDetails } = data;
      
      const payload = {
        account_bank: bankDetails.bankCode,
        account_number: bankDetails.accountNumber,
        amount: amount / 100, // Convert to major currency unit
        currency: currency,
        narration: `Withdrawal: ${reference}`,
        reference: reference,
        callback_url: process.env.FLUTTERWAVE_TRANSFER_CALLBACK_URL,
        debit_currency: currency
      };

      const response = await this.client.post('/transfers', payload);
      
      if (response.data.status !== 'success') {
        throw new AppError(`Transfer failed: ${response.data.message}`, 400);
      }

      return {
        reference: response.data.data.reference,
        status: 'pending',
        provider: 'flutterwave',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Flutterwave payout failed:', error);
      if (error.response) {
        throw new AppError(`Flutterwave error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async createVirtualAccount(data: IVirtualAccountData): Promise<IVirtualAccountResponse> {
    try {
      const { email, firstName, lastName, phoneNumber } = data;
      
      const payload = {
        email: email,
        is_permanent: true,
        bvn: data.bvn || '', // BVN might be required for Nigerian accounts
        tx_ref: `VA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        firstname: firstName,
        lastname: lastName,
        phonenumber: phoneNumber,
        narration: `Virtual Account for ${firstName} ${lastName}`
      };

      const response = await this.client.post('/virtual-account-numbers', payload);
      
      if (response.data.status !== 'success') {
        throw new AppError(`Virtual account creation failed: ${response.data.message}`, 400);
      }

      const account = response.data.data;
      
      return {
        accountNumber: account.account_number,
        accountName: account.account_name,
        bankName: account.bank_name,
        provider: 'flutterwave',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Flutterwave virtual account creation failed:', error);
      if (error.response) {
        throw new AppError(`Flutterwave error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    try {
      if (!this.config.webhookSecret) {
        logger.warn('Webhook secret not configured for Flutterwave');
        return false;
      }
      
      const secretHash = this.config.webhookSecret!;
      const hash = crypto
        .createHmac('sha256', secretHash)
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
      case 'successful':
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
      reference: data.tx_ref,
      status: status,
      amount: data.amount * 100, // Convert to minor currency unit
      currency: data.currency,
      customer: data.customer,
      providerData: data
    };
  }

  async getBanks(): Promise<IBank[]> {
    try {
      const response = await this.client.get('/banks/NG'); // Nigeria banks
      
      if (response.data.status !== 'success') {
        throw new AppError('Failed to fetch banks', 400);
      }

      return response.data.data.map((bank: any) => ({
        name: bank.name,
        code: bank.code,
        provider: 'flutterwave' as const
      }));
      
    } catch (error) {
      logger.error('Failed to fetch banks:', error);
      throw error;
    }
  }

  async resolveAccountNumber(accountNumber: string, bankCode: string): Promise<IAccountResolution> {
    try {
      const payload = {
        account_number: accountNumber,
        account_bank: bankCode
      };

      const response = await this.client.post('/accounts/resolve', payload);
      
      if (response.data.status !== 'success') {
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
        throw new AppError(`Flutterwave error: ${error.response.data.message}`, 400);
      }
      throw error;
    }
  }
}

export default FlutterwaveProvider;