const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const WalletService = require('./WalletService');
const PaymentProviderFactory = require('../providers/PaymentProviderFactory');
const FraudDetectionService = require('./FraudDetectionService');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');
const { addJob } = require('../jobs/queue');

class TransactionService {
  constructor() {
    this.redis = getRedisClient();
  }

  // Initialize transaction with idempotency check
  async initializeTransaction(data) {
    const { tenantId, userId, type, amount, currency, description, paymentMethod, metadata, idempotencyKey } = data;
    
    try {
      // Check for existing transaction with same idempotency key
      if (idempotencyKey) {
        const existingTxn = await Transaction.findOne({
          idempotencyKey,
          tenant: tenantId
        });
        
        if (existingTxn) {
          logger.info(`Returning existing transaction for idempotency key: ${idempotencyKey}`);
          return existingTxn;
        }
      }
      
      // Generate unique reference
      const reference = Transaction.generateReference();
      
      // Run fraud detection
      const riskAssessment = await FraudDetectionService.assessTransaction({
        tenantId,
        userId,
        amount,
        currency,
        type,
        paymentMethod,
        metadata
      });
      
      if (riskAssessment.shouldBlock) {
        throw new AppError(`Transaction blocked: ${riskAssessment.reason}`, 403);
      }
      
      // Create transaction
      const transaction = new Transaction({
        reference,
        tenant: tenantId,
        user: userId,
        type,
        amount,
        currency,
        description,
        paymentMethod,
        metadata,
        idempotencyKey,
        riskScore: riskAssessment.score,
        fraudFlags: riskAssessment.flags,
        clientIp: metadata?.clientIp,
        userAgent: metadata?.userAgent
      });
      
      await transaction.save();
      
      // Add to processing queue for async processing
      await addJob('processTransaction', {
        transactionId: transaction._id.toString()
      });
      
      logger.info(`Transaction initialized: ${reference}`);
      return transaction;
      
    } catch (error) {
      logger.error('Failed to initialize transaction:', error);
      throw error;
    }
  }

  // Process transaction based on type
  async processTransaction(transactionId) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }
      
      if (!transaction.canBeProcessed()) {
        logger.warn(`Transaction ${transaction.reference} cannot be processed. Status: ${transaction.status}`);
        return transaction;
      }
      
      transaction.markAsProcessing();
      await transaction.save({ session });
      
      let result;
      
      switch (transaction.type) {
        case 'deposit':
          result = await this.processDeposit(transaction, session);
          break;
        case 'withdrawal':
          result = await this.processWithdrawal(transaction, session);
          break;
        case 'transfer':
          result = await this.processTransfer(transaction, session);
          break;
        default:
          throw new AppError(`Unsupported transaction type: ${transaction.type}`, 400);
      }
      
      await session.commitTransaction();
      
      // Schedule webhook notification
      await addJob('sendWebhook', {
        transactionId: transaction._id.toString(),
        event: 'transaction.completed'
      });
      
      logger.info(`Transaction processed successfully: ${transaction.reference}`);
      return result;
      
    } catch (error) {
      await session.abortTransaction();
      
      // Mark transaction as failed
      try {
        await Transaction.findByIdAndUpdate(transactionId, {
          status: 'failed',
          failedAt: new Date(),
          'metadata.failureReason': error.message
        });
      } catch (updateError) {
        logger.error('Failed to update transaction status:', updateError);
      }
      
      logger.error(`Transaction processing failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Process deposit transaction
  async processDeposit(transaction, session) {
    try {
      // Get user's wallet
      const wallet = await Wallet.findOne({
        user: transaction.user,
        tenant: transaction.tenant,
        currency: transaction.currency
      }).session(session);
      
      if (!wallet) {
        throw new AppError('User wallet not found', 404);
      }
      
      // For external payments, use payment provider
      if (transaction.paymentMethod !== 'wallet') {
        const provider = PaymentProviderFactory.getProvider(
          transaction.provider || 'paystack',
          transaction.tenant
        );
        
        const paymentResult = await provider.initializePayment({
          amount: transaction.amount,
          currency: transaction.currency,
          reference: transaction.reference,
          email: wallet.user.email,
          metadata: transaction.metadata
        });
        
        transaction.providerReference = paymentResult.reference;
        transaction.providerResponse = paymentResult;
        transaction.status = 'pending'; // Wait for webhook confirmation
        
        await transaction.save({ session });
        
        return { transaction, paymentUrl: paymentResult.authorizationUrl };
      }
      
      // For wallet funding (e.g., via virtual account)
      await WalletService.creditWallet(
        wallet._id,
        transaction.amount,
        transaction.description,
        transaction.reference,
        session
      );
      
      transaction.destinationWallet = wallet._id;
      transaction.markAsCompleted();
      await transaction.save({ session });
      
      return { transaction, wallet };
      
    } catch (error) {
      logger.error('Deposit processing failed:', error);
      throw error;
    }
  }

  // Process withdrawal transaction
  async processWithdrawal(transaction, session) {
    try {
      const wallet = await Wallet.findOne({
        user: transaction.user,
        tenant: transaction.tenant,
        currency: transaction.currency
      }).session(session);
      
      if (!wallet) {
        throw new AppError('User wallet not found', 404);
      }
      
      // Check if wallet has sufficient balance
      if (!wallet.canTransact(transaction.amount)) {
        throw new AppError('Insufficient wallet balance', 400);
      }
      
      // Debit wallet first
      await WalletService.debitWallet(
        wallet._id,
        transaction.amount,
        transaction.description,
        transaction.reference,
        session
      );
      
      transaction.sourceWallet = wallet._id;
      
      // For external withdrawals, initiate payout via provider
      if (transaction.paymentMethod !== 'wallet') {
        const provider = PaymentProviderFactory.getProvider(
          transaction.provider || 'paystack',
          transaction.tenant
        );
        
        const payoutResult = await provider.initiatePayout({
          amount: transaction.amount,
          currency: transaction.currency,
          reference: transaction.reference,
          bankDetails: transaction.metadata.bankDetails
        });
        
        transaction.providerReference = payoutResult.reference;
        transaction.providerResponse = payoutResult;
      }
      
      transaction.markAsCompleted();
      await transaction.save({ session });
      
      return { transaction, wallet };
      
    } catch (error) {
      logger.error('Withdrawal processing failed:', error);
      throw error;
    }
  }

  // Process transfer transaction
  async processTransfer(transaction, session) {
    try {
      const { sourceWalletId, destinationWalletId } = transaction.metadata;
      
      if (!sourceWalletId || !destinationWalletId) {
        throw new AppError('Source and destination wallets required for transfer', 400);
      }
      
      // Verify wallets exist and belong to tenant
      const [sourceWallet, destinationWallet] = await Promise.all([
        Wallet.findOne({ _id: sourceWalletId, tenant: transaction.tenant }).session(session),
        Wallet.findOne({ _id: destinationWalletId, tenant: transaction.tenant }).session(session)
      ]);
      
      if (!sourceWallet || !destinationWallet) {
        throw new AppError('One or both wallets not found', 404);
      }
      
      // Perform transfer
      await WalletService.transferBetweenWallets(
        sourceWalletId,
        destinationWalletId,
        transaction.amount,
        transaction.description
      );
      
      transaction.sourceWallet = sourceWalletId;
      transaction.destinationWallet = destinationWalletId;
      transaction.markAsCompleted();
      await transaction.save({ session });
      
      return { transaction, sourceWallet, destinationWallet };
      
    } catch (error) {
      logger.error('Transfer processing failed:', error);
      throw error;
    }
  }

  // Handle webhook events from payment providers
  async handleWebhook(provider, event, signature, tenantId) {
    try {
      const providerInstance = PaymentProviderFactory.getProvider(provider, tenantId);
      
      // Verify webhook signature
      const isValid = await providerInstance.verifyWebhook(event, signature);
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 400);
      }
      
      const { reference, status, amount } = providerInstance.parseWebhookEvent(event);
      
      // Find transaction by provider reference
      const transaction = await Transaction.findOne({
        $or: [
          { reference },
          { providerReference: reference }
        ],
        tenant: tenantId
      });
      
      if (!transaction) {
        logger.warn(`Transaction not found for webhook: ${reference}`);
        return { processed: false, message: 'Transaction not found' };
      }
      
      // Update transaction status based on webhook
      await this.updateTransactionFromWebhook(transaction, status, event);
      
      logger.info(`Webhook processed for transaction: ${transaction.reference}`);
      return { processed: true, transaction };
      
    } catch (error) {
      logger.error('Webhook processing failed:', error);
      throw error;
    }
  }

  async updateTransactionFromWebhook(transaction, status, webhookData) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const updatedTransaction = await Transaction.findById(transaction._id).session(session);
      
      switch (status) {
        case 'success':
          if (updatedTransaction.type === 'deposit' && updatedTransaction.status === 'pending') {
            // Credit user wallet for successful deposit
            const wallet = await Wallet.findOne({
              user: updatedTransaction.user,
              tenant: updatedTransaction.tenant,
              currency: updatedTransaction.currency
            }).session(session);
            
            if (wallet) {
              await WalletService.creditWallet(
                wallet._id,
                updatedTransaction.amount,
                updatedTransaction.description,
                updatedTransaction.reference,
                session
              );
              
              updatedTransaction.destinationWallet = wallet._id;
            }
          }
          updatedTransaction.markAsCompleted();
          break;
          
        case 'failed':
          updatedTransaction.markAsFailed('Payment failed at provider');
          break;
          
        default:
          logger.warn(`Unknown webhook status: ${status}`);
      }
      
      updatedTransaction.providerResponse = webhookData;
      await updatedTransaction.save({ session });
      
      await session.commitTransaction();
      
      // Schedule webhook notification to tenant
      await addJob('sendWebhook', {
        transactionId: updatedTransaction._id.toString(),
        event: `transaction.${status}`
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get transaction by reference
  async getTransactionByReference(reference, tenantId) {
    const cacheKey = `transaction:${tenantId}:${reference}`;
    
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Redis cache read failed:', error);
    }
    
    const transaction = await Transaction.findOne({ reference, tenant: tenantId })
      .populate('user', 'firstName lastName email')
      .populate('sourceWallet destinationWallet');
    
    if (transaction) {
      // Cache for 5 minutes
      await this.redis.setEx(cacheKey, 300, JSON.stringify(transaction));
    }
    
    return transaction;
  }

  // Get paginated transaction history
  async getTransactionHistory(filters, pagination) {
    const { tenantId, userId, status, type, startDate, endDate } = filters;
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    
    const query = { tenant: tenantId };
    
    if (userId) query.user = userId;
    if (status) query.status = status;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('user', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(query)
    ]);
    
    return {
      transactions,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  // Retry failed transactions
  async retryFailedTransaction(transactionId) {
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    if (transaction.status !== 'failed') {
      throw new AppError('Only failed transactions can be retried', 400);
    }
    
    // Reset transaction status
    transaction.status = 'pending';
    transaction.failedAt = undefined;
    await transaction.save();
    
    // Re-queue for processing
    await addJob('processTransaction', {
      transactionId: transaction._id.toString()
    });
    
    logger.info(`Transaction retry queued: ${transaction.reference}`);
    return transaction;
  }
}

module.exports = new TransactionService();