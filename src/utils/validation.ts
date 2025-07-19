import Joi from 'joi';
import { Types } from 'mongoose';

// Custom Joi validators
export const objectId = Joi.string().custom((value, helpers) => {
  if (!Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId validation');

// Common validation schemas
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().default('-createdAt')
});

export const transactionSchema = Joi.object({
  type: Joi.string().valid('deposit', 'withdrawal', 'transfer').required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').required(),
  description: Joi.string().min(1).max(255).required(),
  paymentMethod: Joi.string().valid('card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet').default('card'),
  provider: Joi.string().valid('paystack', 'flutterwave', 'stripe').optional(),
  metadata: Joi.object().optional(),
  idempotencyKey: Joi.string().optional()
});

export const walletSchema = Joi.object({
  currency: Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').required()
});

export const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  phoneNumber: Joi.string().optional(),
  tenantId: objectId.required()
});

export const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  tenantId: objectId.required()
});

export const tenantRegistrationSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  businessType: Joi.string().valid('ecommerce', 'fintech', 'marketplace', 'saas').required()
});

// Validation middleware factory
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors
      });
    }
    
    req.body = value;
    next();
  };
};