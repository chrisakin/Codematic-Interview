import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import { generateSchemasFromDTOs } from '@/utils/swagger';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Virtual Wallet API',
      version: '1.0.0',
      description: 'Multi-Provider Virtual Wallet & Payment System API',
      contact: {
        name: 'API Support',
        email: 'support@virtualwallet.com'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        // Auto-generated schemas from DTOs will be added here
        ...generateSchemasFromDTOs(),
        Error: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            status: { type: 'string', enum: ['active', 'suspended', 'pending'] },
            kycStatus: { type: 'string', enum: ['pending', 'verified', 'rejected'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Wallet: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            currency: { type: 'string', enum: ['NGN', 'USD', 'GBP', 'EUR'] },
            balance: { type: 'number' },
            ledgerBalance: { type: 'number' },
            status: { type: 'string', enum: ['active', 'suspended', 'frozen'] },
            formattedBalance: {
              type: 'object',
              properties: {
                balance: { type: 'number' },
                ledgerBalance: { type: 'number' },
                currency: { type: 'string' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            reference: { type: 'string' },
            type: { type: 'string', enum: ['deposit', 'withdrawal', 'transfer', 'fee', 'refund'] },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
            amount: { type: 'number' },
            currency: { type: 'string', enum: ['NGN', 'USD', 'GBP', 'EUR'] },
            description: { type: 'string' },
            paymentMethod: { type: 'string', enum: ['card', 'bank_transfer', 'mobile_money', 'virtual_account', 'wallet'] },
            provider: { type: 'string', enum: ['paystack', 'flutterwave', 'stripe'] },
            riskScore: { type: 'number', minimum: 0, maximum: 100 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        }
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/models/*.ts',
    './src/dto/*.ts'
  ],
};

const specs = swaggerJsdoc(options);

const setupSwagger = (app: Application): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
  }));
};

export { setupSwagger, specs };