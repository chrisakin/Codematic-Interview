import mongoose, { ClientSession } from 'mongoose';
import Transaction from '@/models/Transaction';
import Wallet from '@/models/Wallet';
import { WalletService } from './WalletService';
import PaymentProviderFactory from '@/providers/PaymentProviderFactory';
import FraudDetectionService from './FraudDetectionService';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import { AppError } from '@/utils/errors';
import { addJobSimple as addJob } from '@/jobs/queue';
import { 
  ITransaction, 
  IWallet, 
  ITransactionInitData, 
  ITransactionFilters, 
  IPaginationOptions, 
  IPaginationResult,
  PaymentProvider,
  TransactionStatus,
  Types
} from '@/types';
import { GetWalletTransactionsDto } from '@/dto/wallet.dto';
import { RedisClientType } from 'redis';

export class TransactionService {
  private redis: RedisClientType;
  private walletService: WalletService;

  constructor() {
    this.redis = getRedisClient();
    this.walletService = new WalletService();
  }

  // Initialize transaction with idempotency check
  async initializeTransaction(data: ITransactionInitData): Promise<ITransaction> {
    const { tenantId, userId, type, amount, currency, description, paymentMethod, metadata, idempotencyKey } = data;
    
    try {
      // Check for existing transaction with same idempotency key
      if (idempotencyKey) {
        const existingTxn = await Transaction.findOne({
          idempotencyKey,
          tenant: tenantId
        }) as ITransaction;
        
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
      }) as ITransaction;
      
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
  async processTransaction(transactionId: string): Promise<ITransaction> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const transaction = await Transaction.findById(transactionId).session(session) as ITransaction;
      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }
      
      if (!transaction.canBeProcessed()) {
        logger.warn(`Transaction ${transaction.reference} cannot be processed. Status: ${transaction.status}`);
        return transaction;
      }
      
      transaction.markAsProcessing();
      await transaction.save({ session });
      
      let result: any;
      
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
          'metadata.failureReason': (error as Error).message
        });
      } catch (updateError) {
        logger.error('Failed to update transaction status:', updateError);
      }
      
      logger.error(`Transaction processing failed: ${(error as Error).message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Process deposit transaction
  async processDeposit(transaction: ITransaction, session: ClientSession): Promise<any> {
    try {
      // Get user's wallet
      const wallet = await Wallet.findOne({
        user: transaction.user,
        tenant: transaction.tenant,
        currency: transaction.currency
      }).session(session) as IWallet;
      
      if (!wallet) {
        throw new AppError('User wallet not found', 404);
      }
      
      // For external payments, use payment provider
      if (transaction.paymentMethod !== 'wallet') {
        const provider = await PaymentProviderFactory.getProvider(
          transaction.provider || 'paystack',
          transaction.tenant as Types.ObjectId
        );
        
        const paymentResult = await provider.initializePayment({
          amount: transaction.amount,
          currency: transaction.currency,
          reference: transaction.reference,
          email: (wallet.user as any).email,
          metadata: transaction.metadata
        });
        
        transaction.providerReference = paymentResult.reference;
        transaction.providerResponse = paymentResult;
        transaction.status = 'pending'; // Wait for webhook confirmation
        
        await transaction.save({ session });
        
        return { transaction, paymentUrl: paymentResult.authorizationUrl };
      }
      
      // For wallet funding (e.g., via virtual account)
      await this.walletService.creditWallet(
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
  async processWithdrawal(transaction: ITransaction, session: ClientSession): Promise<any> {
    try {
      const wallet = await Wallet.findOne({
        user: transaction.user,
        tenant: transaction.tenant,
        currency: transaction.currency
      }).session(session) as IWallet;
      
      if (!wallet) {
        throw new AppError('User wallet not found', 404);
      }
      
      // Check if wallet has sufficient balance
      if (!wallet.canTransact(transaction.amount)) {
        throw new AppError('Insufficient wallet balance', 400);
      }
      
      // Debit wallet first
      await this.walletService.debitWallet(
        wallet._id,
        transaction.amount,
        transaction.description,
        transaction.reference,
        session
      );
      
      transaction.sourceWallet = wallet._id;
      
      // For external withdrawals, initiate payout via provider
      if (transaction.paymentMethod !== 'wallet') {
        const provider = await PaymentProviderFactory.getProvider(
          transaction.provider || 'paystack',
          transaction.tenant as Types.ObjectId
        );
        
        const payoutResult = await provider.initiatePayout({
          amount: transaction.amount,
          currency: transaction.currency,
          reference: transaction.reference,
          bankDetails: transaction.metadata?.bankDetails
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
  async processTransfer(transaction: ITransaction, session: ClientSession): Promise<any> {
    try {
      const { sourceWalletId, destinationWalletId } = transaction.metadata || {};
      
      if (!sourceWalletId || !destinationWalletId) {
        throw new AppError('Source and destination wallets required for transfer', 400);
      }
      
      // Verify wallets exist and belong to tenant
      const [sourceWallet, destinationWallet] = await Promise.all([
        Wallet.findOne({ _id: sourceWalletId, tenant: transaction.tenant }).session(session) as Promise<IWallet>,
        Wallet.findOne({ _id: destinationWalletId, tenant: transaction.tenant }).session(session) as Promise<IWallet>
      ]);
      
      if (!sourceWallet || !destinationWallet) {
        throw new AppError('One or both wallets not found', 404);
      }
      
      // Perform transfer
      await this.walletService.transferBetweenWalletIds(
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
  async handleWebhook(provider: PaymentProvider, event: any, signature: string, tenantId: string): Promise<any> {
    try {
      const providerInstance = await PaymentProviderFactory.getProvider(provider, new Types.ObjectId(tenantId));
      
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
        tenant: new Types.ObjectId(tenantId)
      }) as ITransaction;
      
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

  private async updateTransactionFromWebhook(transaction: ITransaction, status: string, webhookData: any): Promise<void> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const updatedTransaction = await Transaction.findById(transaction._id).session(session) as ITransaction;
      
      if (!updatedTransaction) {
        throw new AppError('Transaction not found', 404);
      }
      
      switch (status) {
        case 'success':
          if (updatedTransaction.type === 'deposit' && updatedTransaction.status === 'pending') {
            // Credit user wallet for successful deposit
            const wallet = await Wallet.findOne({
              user: updatedTransaction.user,
              tenant: updatedTransaction.tenant,
              currency: updatedTransaction.currency
            }).session(session) as IWallet;
            
            if (wallet) {
              await this.walletService.creditWallet(
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
  async getTransactionByReference(reference: string, tenantId: Types.ObjectId, userId?: Types.ObjectId): Promise<ITransaction | null> {
    const cacheKey = `transaction:${tenantId}:${reference}`;
    
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const transaction = JSON.parse(cached);
        // Check ownership if userId provided
        if (userId && transaction.user?.toString() !== userId.toString()) {
          throw new AppError('Access denied', 403);
        }
        return transaction;
      }
    } catch (error) {
      logger.warn('Redis cache read failed:', error);
    }
    
    const query: any = { reference, tenant: tenantId };
    if (userId) {
      query.user = userId;
    }
    
    const transaction = await Transaction.findOne(query)
      .populate('user', 'firstName lastName email')
      .populate('sourceWallet destinationWallet') as ITransaction;
    
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    // Cache for 5 minutes
    try {
      await this.redis.setEx(cacheKey, 300, JSON.stringify(transaction));
    } catch (error) {
      logger.warn('Redis cache write failed:', error);
    }
    
    return transaction;
  }

  // Get paginated transaction history
  async getTransactionHistory(filters: ITransactionFilters & IPaginationOptions): Promise<IPaginationResult<ITransaction>> {
    const { tenantId, userId, status, type, startDate, endDate, page = 1, limit = 20, sort = '-createdAt' } = filters;
    
    const query: any = { tenant: tenantId };
    
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
        .lean() as Promise<ITransaction[]>,
      Transaction.countDocuments(query)
    ]);
    
    return {
      data: transactions,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  // Get wallet transactions
  async getWalletTransactions(walletId: Types.ObjectId, dto: GetWalletTransactionsDto): Promise<IPaginationResult<ITransaction>> {
    const { page = 1, limit = 20, type } = dto;
    
    const query: any = {
      $or: [
        { sourceWallet: walletId },
        { destinationWallet: walletId }
      ]
    };
    
    if (type) {
      query.type = type;
    }
    
    const skip = (page - 1) * limit;
    
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean() as Promise<ITransaction[]>,
      Transaction.countDocuments(query)
    ]);
    
    return {
      data: transactions,
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
  async retryFailedTransaction(transactionId: string, userId?: Types.ObjectId): Promise<ITransaction> {
    const transaction = await Transaction.findById(transactionId) as ITransaction;
    
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    // Check ownership if userId provided
    if (userId && transaction.user?._id.toString() !== userId.toString()) {
      throw new AppError('Access denied', 403);
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

  // Get transaction statistics
  async getTransactionStats(userId: Types.ObjectId, tenantId: Types.ObjectId, period: string = 'month') {
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const stats = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          tenant: tenantId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            type: '$type'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $group: {
          _id: '$_id.status',
          types: {
            $push: {
              type: '$_id.type',
              count: '$count',
              totalAmount: '$totalAmount'
            }
          },
          totalCount: { $sum: '$count' },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    return stats;
  }

  // Validate transaction (placeholder for additional validation logic)
  async validateTransaction(transactionId: string): Promise<void> {
    const transaction = await Transaction.findById(transactionId) as ITransaction;
    
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    // Add validation logic here
    logger.info(`Transaction validated: ${transaction.reference}`);
  }
}