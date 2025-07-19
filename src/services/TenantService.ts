import Tenant from '@/models/Tenant';
import { AppError } from '@/utils/errors';
import logger from '@/config/logger';
import { ITenant } from '@/types';
import { RegisterTenantDto } from '@/dto/auth.dto';

export class TenantService {
  async registerTenant(dto: RegisterTenantDto) {
    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({ email: dto.email }) as ITenant;
    if (existingTenant) {
      throw new AppError('Tenant already exists', 409);
    }

    // Generate API keys
    const crypto = require('crypto');
    const apiKey = `pk_${crypto.randomBytes(20).toString('hex')}`;
    const secretKey = `sk_${crypto.randomBytes(32).toString('hex')}`;

    const tenant = new Tenant({
      name: dto.name,
      email: dto.email,
      businessType: dto.businessType,
      apiKey,
      secretKey,
      status: 'active',
      settings: {
        enabledProviders: ['paystack'],
        rateLimit: {
          requests: 1000,
          windowMs: 900000 // 15 minutes
        }
      }
    }) as ITenant;

    await tenant.save();

    logger.info(`Tenant registered: ${dto.name} (${dto.email})`);

    return {
      tenant: tenant.toSafeJSON(),
      apiKey: tenant.apiKey
    };
  }

  async getTenantById(tenantId: string): Promise<ITenant> {
    const tenant = await Tenant.findById(tenantId) as ITenant;
    if (!tenant) {
      throw new AppError('Tenant not found', 404);
    }
    return tenant;
  }

  async getTenantByApiKey(apiKey: string): Promise<ITenant> {
    const tenant = await Tenant.findOne({ apiKey }) as ITenant;
    if (!tenant) {
      throw new AppError('Invalid API key', 401);
    }
    return tenant;
  }
}