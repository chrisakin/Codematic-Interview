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
  IWebhookEvent,
  IBank,
  IAccountResolution,
  IProviderConfig
} from '@/types';

class StripeProvider implements IPaymentProvider {
  private config: IProviderConfig;
  private baseURL: string = 'https://api.stripe.com/v1';
  private client: AxiosInstance;

  constructor(config: IProviderConfig) {
    this.config = config;
    
    if (!config.secretKey) {
      throw new AppError('Stripe secret key is required', 400);
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000
    });
  }

  async initializePayment(data: IPaymentInitData): Promise<IPaymentInitResponse> {
    try {
      const { amount, currency, reference, email, metadata } = data;
      
      // Create payment intent
      const payload = new URLSearchParams({
        amount: amount.toString(), // Stripe expects amount in cents/minor currency unit
        currency: currency.toLowerCase(),
        'metadata[reference]': reference,
        'metadata[email]': email,
        automatic_payment_methods: 'enabled',
        confirmation_method: 'manual',
        confirm: 'false'
      });

      // Add metadata
      if (metadata) {
        Object.keys(metadata).forEach(key => {
          payload.append(`metadata[${key}]`, metadata[key]);
        });
      }

      const response = await this.client.post('/payment_intents', payload);
      
      return {
        reference: reference,
        authorizationUrl: `${process.env.FRONTEND_URL}/payment/stripe?client_secret=${response.data.client_secret}`,
        clientSecret: response.data.client_secret,
        paymentIntentId: response.data.id,
        provider: 'stripe',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Stripe payment initialization failed:', error);
      if (error.response) {
        throw new AppError(`Stripe error: ${error.response.data.error.message}`, 400);
      }
      throw error;
    }
  }

  async verifyPayment(paymentIntentId: string): Promise<IPaymentVerificationResponse> {
    try {
      const response = await this.client.get(`/payment_intents/${paymentIntentId}`);
      
      const paymentIntent = response.data;
      
      return {
        reference: paymentIntent.metadata.reference,
        status: paymentIntent.status === 'succeeded' ? 'completed' : 'failed',
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        paidAt: paymentIntent.created.toString(),
        channel: 'card',
        providerResponse: response.data
      };
      
    } catch (error: any) {
      logger.error('Stripe payment verification failed:', error);
      if (error.response) {
        throw new AppError(`Stripe error: ${error.response.data.error.message}`, 400);
      }
      throw error;
    }
  }

  async initiatePayout(data: IPayoutData): Promise<IPayoutResponse> {
    try {
      const { amount, currency, reference, bankDetails } = data;
      
      // First create a bank account
      const accountPayload = new URLSearchParams({
        object: 'bank_account',
        country: bankDetails.country || 'NG',
        currency: currency.toLowerCase(),
        account_holder_name: bankDetails.accountName,
        account_number: bankDetails.accountNumber,
        routing_number: bankDetails.routingNumber || bankDetails.bankCode
      });

      const accountResponse = await this.client.post('/tokens', accountPayload);
      
      // Create transfer
      const transferPayload = new URLSearchParams({
        amount: amount.toString(),
        currency: currency.toLowerCase(),
        destination: accountResponse.data.id,
        'metadata[reference]': reference
      });

      const transferResponse = await this.client.post('/transfers', transferPayload);
      
      return {
        reference: reference,
        status: 'pending',
        transferId: transferResponse.data.id,
        provider: 'stripe',
        providerResponse: transferResponse.data
      };
      
    } catch (error: any) {
      logger.error('Stripe payout failed:', error);
      if (error.response) {
        throw new AppError(`Stripe error: ${error.response.data.error.message}`, 400);
      }
      throw error;
    }
  }

  async verifyWebhook(payload: any, signature: string): Promise<boolean> {
    try {
      if (!this.config.webhookSecret) {
        logger.warn('Webhook secret not configured for Stripe');
        return false;
      }
      
      const elements = signature.split(',');
      let timestamp: string | undefined;
      let signatures: string[] = [];

      for (const element of elements) {
        const [key, value] = element.split('=');
        if (key === 't') {
          timestamp = value;
        } else if (key === 'v1') {
          signatures.push(value);
        }
      }

      if (!timestamp || signatures.length === 0) {
        return false;
      }

      const payloadForSignature = `${timestamp}.${JSON.stringify(payload)}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret!)
        .update(payloadForSignature)
        .digest('hex');

      return signatures.some(sig => crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(sig, 'hex')
      ));
    } catch (error) {
      logger.error('Webhook verification failed:', error);
      return false;
    }
  }

  parseWebhookEvent(payload: any): IWebhookEvent {
    const { type, data } = payload;
    
    let status: 'success' | 'failed' | 'pending';
    switch (data.object.status) {
      case 'succeeded':
        status = 'success';
        break;
      case 'failed':
      case 'canceled':
        status = 'failed';
        break;
      default:
        status = 'pending';
    }

    return {
      event: type,
      reference: data.object.metadata.reference,
      status: status,
      amount: data.object.amount,
      currency: data.object.currency.toUpperCase(),
      customer: data.object.customer,
      providerData: data.object
    };
  }

  // Stripe doesn't have a direct bank list API for all countries
  async getBanks(): Promise<IBank[]> {
    // This would typically be handled differently for Stripe
    // as it uses different routing numbers per country
    return [];
  }

  async resolveAccountNumber(accountNumber: string, routingNumber: string): Promise<IAccountResolution> {
    // Stripe handles account validation differently
    // This is typically done during the payment/transfer flow
    return {
      accountNumber: accountNumber,
      accountName: 'Validated Account', // Placeholder
      bankCode: routingNumber
    };
  }
}

export default StripeProvider;