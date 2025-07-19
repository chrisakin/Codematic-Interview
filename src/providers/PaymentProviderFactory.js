const PaystackProvider = require('./PaystackProvider');
const FlutterwaveProvider = require('./FlutterwaveProvider');
const StripeProvider = require('./StripeProvider');
const Tenant = require('../models/Tenant');
const { AppError } = require('../utils/errors');

class PaymentProviderFactory {
  static async getProvider(providerName, tenantId) {
    try {
      // Get tenant configuration
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }

      // Check if provider is enabled for tenant
      if (!tenant.settings.enabledProviders.includes(providerName)) {
        throw new AppError(`Provider ${providerName} not enabled for tenant`, 400);
      }

      const providerConfig = tenant.providerConfigs[providerName];
      if (!providerConfig || !providerConfig.secretKey) {
        throw new AppError(`Provider ${providerName} not configured`, 400);
      }

      // Return appropriate provider instance
      switch (providerName.toLowerCase()) {
        case 'paystack':
          return new PaystackProvider(providerConfig);
        case 'flutterwave':
          return new FlutterwaveProvider(providerConfig);
        case 'stripe':
          return new StripeProvider(providerConfig);
        default:
          throw new AppError(`Unsupported provider: ${providerName}`, 400);
      }
    } catch (error) {
      throw error;
    }
  }

  static getSupportedProviders() {
    return ['paystack', 'flutterwave', 'stripe'];
  }
}

module.exports = PaymentProviderFactory;