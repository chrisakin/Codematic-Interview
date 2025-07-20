import mongoose, { ClientSession } from 'mongoose';
import Wallet from '@/models/Wallet';
import Transaction from '@/models/Transaction';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import { AppError } from '@/utils/errors';
import { IWallet, ITransaction, Currency, IFormattedBalance } from '@/types';
import { FundWalletDto, TransferBetweenWalletsDto } from '@/dto/wallet.dto';
import { Types } from 'mongoose';
import { RedisClientType } from 'redis';

export class WalletService {
  private _redis: RedisClientType | null = null;
  private lockValue: string | null = null;

  // Lazy initialization of Redis client
  get redis(): RedisClientType {
    if (!this._redis) {
      this._redis = getRedisClient();
    }
    return this._redis;
  }

  async createWallet(userId: Types.ObjectId, tenantId: Types.ObjectId, currency: Currency = 'NGN'): Promise<IWallet> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      // Check if wallet already exists
      const existingWallet = await Wallet.findOne({
        user: userId,
        tenant: tenantId,
        currency
      }).session(session) as IWallet;
      
      if (existingWallet) {
        throw new AppError('Wallet already exists for this currency', 400);
      }
      
      const wallet = new Wallet({
        user: userId,
        tenant: tenantId,
        currency,
        balance: 0,
        ledgerBalance: 0
      }) as IWallet;
      
      await wallet.save({ session });
      await session.commitTransaction();
      
      // Cache wallet
      await this.cacheWallet(wallet);
      
      logger.info(`Wallet created for user ${userId}, currency ${currency}`);
      return wallet;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create wallet:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getWallet(userId: Types.ObjectId, tenantId: Types.ObjectId, currency: Currency, useCache: boolean = true): Promise<IWallet> {
    const cacheKey = this.getWalletCacheKey(userId, currency);
    
    if (useCache) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        logger.warn('Redis cache read failed:', error);
      }
    }
    
    const wallet = await Wallet.findOne({
      user: userId,
      tenant: tenantId,
      currency
    }).populate('user', 'firstName lastName email') as IWallet;
    
    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }
    
    // Cache for 5 minutes
    await this.cacheWallet(wallet, 300);
    
    return wallet;
  }

  async getUserWallets(userId: Types.ObjectId, tenantId: Types.ObjectId, currency?: Currency): Promise<({ [key: string]: any; formattedBalance: IFormattedBalance })[]> {
    try {
      const matchStage: any = {
        user: userId,
        tenant: tenantId
      };

      if (currency) {
        matchStage.currency = currency;
      }

      const pipeline: any = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'transactions',
            let: { walletId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $or: [
                          { $eq: ['$sourceWallet', '$$walletId'] },
                          { $eq: ['$destinationWallet', '$$walletId'] }
                        ]
                      },
                      { $eq: ['$status', 'completed'] }
                    ]
                  }
                }
              },
              { $sort: { createdAt: -1 } },
              { $limit: 5 } // Get last 5 transactions for each wallet
            ],
            as: 'recentTransactions'
          }
        },
        {
          $addFields: {
            formattedBalance: {
              balance: { $divide: ['$balance', 100] },
              ledgerBalance: { $divide: ['$ledgerBalance', 100] },
              currency: '$currency'
            },
            transactionCount: { $size: '$recentTransactions' },
            lastTransactionDate: {
              $cond: {
                if: { $gt: [{ $size: '$recentTransactions' }, 0] },
                then: { $arrayElemAt: ['$recentTransactions.createdAt', 0] },
                else: null
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            user: 1,
            tenant: 1,
            currency: 1,
            balance: 1,
            ledgerBalance: 1,
            status: 1,
            limits: 1,
            virtualAccounts: 1,
            lastTransactionAt: 1,
            createdAt: 1,
            updatedAt: 1,
            formattedBalance: 1,
            transactionCount: 1,
            lastTransactionDate: 1,
            recentTransactions: {
              $map: {
                input: '$recentTransactions',
                as: 'txn',
                in: {
                  _id: '$$txn._id',
                  reference: '$$txn.reference',
                  type: '$$txn.type',
                  amount: '$$txn.amount',
                  description: '$$txn.description',
                  createdAt: '$$txn.createdAt'
                }
              }
            }
          }
        }
      ];

      const walletsWithBalances = await Wallet.aggregate(pipeline);
      
      // Cache the results for each wallet
      for (const wallet of walletsWithBalances) {
        await this.cacheWallet(wallet as any, 300);
      }

      return walletsWithBalances;
    } catch (error) {
      logger.error('Failed to get user wallets with aggregation:', error);
      // Fallback to the original method if aggregation fails
      return this.getUserWalletsLegacy(userId, tenantId, currency);
    }
  }

  // Keep the original method as a fallback
  private async getUserWalletsLegacy(userId: Types.ObjectId, tenantId: Types.ObjectId, currency?: Currency): Promise<({ [key: string]: any; formattedBalance: IFormattedBalance })[]> {
    const query: any = {
      user: userId,
      tenant: tenantId
    };

    if (currency) {
      query.currency = currency;
    }

    const wallets = await Wallet.find(query).lean();

    // Get formatted balances for each wallet
    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        const balance = await this.getWalletBalance(wallet._id);
        return {
          ...wallet,
          formattedBalance: balance
        };
      })
    );

    return walletsWithBalances;
  }

  async fundWallet(walletId: Types.ObjectId, dto: FundWalletDto) {
    // Convert to minor currency unit (cents/kobo)
    const amountInMinor = Math.round(dto.amount * 100);
    const reference = Transaction.generateReference('FUND');

    return await this.creditWallet(
      walletId,
      amountInMinor,
      dto.description,
      reference
    );
  }

  async transferBetweenWallets(userId: Types.ObjectId, tenantId: Types.ObjectId, dto: TransferBetweenWalletsDto) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new AppError('Cannot transfer to the same currency wallet', 400);
    }

    // Convert to minor currency unit
    const amountInMinor = Math.round(dto.amount * 100);

    // Get both wallets
    const [sourceWallet, destinationWallet] = await Promise.all([
      this.getWallet(userId, tenantId, dto.fromCurrency),
      this.getWallet(userId, tenantId, dto.toCurrency)
    ]);

    // For different currencies, you'd typically apply exchange rates here
    // For simplicity, we'll transfer the same amount
    return await this.transferBetweenWalletIds(
      sourceWallet._id,
      destinationWallet._id,
      amountInMinor,
      dto.description
    );
  }

  // Credit wallet with optimistic locking and atomic operations
  async creditWallet(
    walletId: Types.ObjectId, 
    amount: number, 
    description: string, 
    transactionRef: string, 
    session?: ClientSession
  ): Promise<{ wallet: IWallet; transaction: ITransaction }> {
    const shouldCommit = !session;
    if (!session) {
      session = await mongoose.startSession();
      session.startTransaction();
    }
    
    try {
      // Acquire distributed lock
      const lockKey = `wallet_lock:${walletId}`;
      const lockAcquired = await this.acquireLock(lockKey, 30000); // 30 seconds
      
      if (!lockAcquired) {
        throw new AppError('Unable to acquire wallet lock. Try again later.', 423);
      }
      
      // Find wallet with current version
      const wallet = await Wallet.findById(walletId).session(session) as IWallet;
      if (!wallet) {
        throw new AppError('Wallet not found', 404);
      }
      
      if (wallet.status !== 'active') {
        throw new AppError('Wallet is not active', 400);
      }
      
      // Update balances atomically
      const updateResult = await Wallet.updateOne(
        { 
          _id: walletId, 
          __v: wallet.__v // Optimistic concurrency control
        },
        {
          $inc: { 
            balance: amount, 
            ledgerBalance: amount,
            __v: 1
          },
          lastTransactionAt: new Date()
        },
        { session }
      );
      
      if (updateResult.matchedCount === 0) {
        throw new AppError('Wallet update failed due to concurrent modification', 409);
      }
      
      // Create transaction record
      const transaction = new Transaction({
        reference: transactionRef,
        tenant: wallet.tenant,
        user: wallet.user,
        type: 'deposit',
        status: 'completed',
        amount: amount,
        currency: wallet.currency,
        description: description,
        destinationWallet: walletId
      }) as ITransaction;
      
      await transaction.save({ session });
      
      if (shouldCommit) {
        await session.commitTransaction();
      }
      
      // Update cache
      const updatedWallet = await Wallet.findById(walletId) as IWallet;
      await this.cacheWallet(updatedWallet);
      
      // Release lock
      await this.releaseLock(lockKey);
      
      logger.info(`Wallet ${walletId} credited with ${amount}`);
      return { wallet: updatedWallet, transaction };
      
    } catch (error) {
      if (shouldCommit) {
        await session.abortTransaction();
      }
      await this.releaseLock(`wallet_lock:${walletId}`);
      logger.error('Failed to credit wallet:', error);
      throw error;
    } finally {
      if (shouldCommit) {
        session.endSession();
      }
    }
  }

  // Transfer between wallets (atomic transaction)
  async transferBetweenWalletIds(
    sourceWalletId: Types.ObjectId, 
    destinationWalletId: Types.ObjectId, 
    amount: number, 
    description: string
  ): Promise<{ reference: string; amount: number; description: string }> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const transferRef = Transaction.generateReference('TRF');
      
      // Debit source wallet
      await this.debitWallet(sourceWalletId, amount, `Transfer out: ${description}`, `${transferRef}_OUT`, session);
      
      // Credit destination wallet
      await this.creditWallet(destinationWalletId, amount, `Transfer in: ${description}`, `${transferRef}_IN`, session);
      
      await session.commitTransaction();
      
      logger.info(`Transfer completed: ${sourceWalletId} -> ${destinationWalletId}, amount: ${amount}`);
      return { reference: transferRef, amount, description };
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Transfer failed:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Debit wallet with sufficient balance checks
  async debitWallet(
    walletId: Types.ObjectId, 
    amount: number, 
    description: string, 
    transactionRef: string, 
    session?: ClientSession
  ): Promise<{ wallet: IWallet; transaction: ITransaction }> {
    const shouldCommit = !session;
    if (!session) {
      session = await mongoose.startSession();
      session.startTransaction();
    }
    
    try {
      const lockKey = `wallet_lock:${walletId}`;
      const lockAcquired = await this.acquireLock(lockKey, 30000);
      
      if (!lockAcquired) {
        throw new AppError('Unable to acquire wallet lock. Try again later.', 423);
      }
      
      const wallet = await Wallet.findById(walletId).session(session) as IWallet;
      if (!wallet) {
        throw new AppError('Wallet not found', 404);
      }
      
      if (!wallet.canTransact(amount)) {
        throw new AppError('Insufficient balance or inactive wallet', 400);
      }
      
      if (!wallet.checkDailyLimit(amount)) {
        throw new AppError('Daily transaction limit exceeded', 400);
      }
      
      // Update balances
      const updateResult = await Wallet.updateOne(
        { 
          _id: walletId, 
          __v: wallet.__v,
          ledgerBalance: { $gte: amount } // Double-check balance
        },
        {
          $inc: { 
            balance: -amount, 
            ledgerBalance: -amount,
            __v: 1
          },
          lastTransactionAt: new Date()
        },
        { session }
      );
      
      if (updateResult.matchedCount === 0) {
        throw new AppError('Insufficient balance or concurrent modification', 409);
      }
      
      // Update daily usage
      wallet.updateDailyUsage(amount);
      await wallet.save({ session });
      
      // Create transaction
      const transaction = new Transaction({
        reference: transactionRef,
        tenant: wallet.tenant,
        user: wallet.user,
        type: 'withdrawal',
        status: 'completed',
        amount: amount,
        currency: wallet.currency,
        description: description,
        sourceWallet: walletId
      }) as ITransaction;
      
      await transaction.save({ session });
      
      if (shouldCommit) {
        await session.commitTransaction();
      }
      
      // Update cache
      const updatedWallet = await Wallet.findById(walletId) as IWallet;
      await this.cacheWallet(updatedWallet);
      
      await this.releaseLock(lockKey);
      
      logger.info(`Wallet ${walletId} debited with ${amount}`);
      return { wallet: updatedWallet, transaction };
      
    } catch (error) {
      if (shouldCommit) {
        await session.abortTransaction();
      }
      await this.releaseLock(`wallet_lock:${walletId}`);
      logger.error('Failed to debit wallet:', error);
      throw error;
    } finally {
      if (shouldCommit) {
        session.endSession();
      }
    }
  }

  // Get wallet balance from cache or database
  async getWalletBalance(walletId: Types.ObjectId): Promise<IFormattedBalance> {
    try {
      const cacheKey = `wallet_balance:${walletId}`;
      let cached: string | null = null;
      
      try {
        cached = await this.redis.get(cacheKey);
      } catch (error) {
        logger.warn('Redis cache read failed:', error);
      }
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      const wallet = await Wallet.findById(walletId) as IWallet;
      if (!wallet) {
        throw new AppError('Wallet not found', 404);
      }
      
      const balance = wallet.formatBalance();
      
      // Cache for 1 minute
      try {
        await this.redis.setEx(cacheKey, 60, JSON.stringify(balance));
      } catch (error) {
        logger.warn('Redis cache write failed:', error);
      }
      
      return balance;
    } catch (error) {
      logger.error('Failed to get wallet balance:', error);
      throw error;
    }
  }

  // Cache management
  async cacheWallet(wallet: IWallet, ttl: number = 300): Promise<void> {
    try {
      const cacheKey = this.getWalletCacheKey(wallet.user as Types.ObjectId, wallet.currency);
      await this.redis.setEx(cacheKey, ttl, JSON.stringify(wallet));
    } catch (error) {
      logger.warn('Failed to cache wallet:', error);
    }
  }

  async invalidateWalletCache(userId: Types.ObjectId, currency: Currency): Promise<void> {
    try {
      const cacheKey = this.getWalletCacheKey(userId, currency);
      await this.redis.del(cacheKey);
    } catch (error) {
      logger.warn('Failed to invalidate wallet cache:', error);
    }
  }

  getWalletCacheKey(userId: Types.ObjectId, currency: Currency): string {
    return `wallet:${userId}:${currency}`;
  }

  // Distributed locking with Redis
  async acquireLock(lockKey: string, ttlMs: number = 30000): Promise<boolean> {
    try {
      const lockValue = `${Date.now()}_${Math.random()}`;
      const result = await this.redis.set(lockKey, lockValue, {
        PX: ttlMs,
        NX: true
      });
      
      if (result === 'OK') {
        this.lockValue = lockValue;
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to acquire lock:', error);
      return false;
    }
  }

  async releaseLock(lockKey: string): Promise<void> {
    try {
      if (this.lockValue) {
        // Use Lua script for atomic lock release
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redis.eval(script, {
          keys: [lockKey],
          arguments: [this.lockValue]
        });
        this.lockValue = null;
      }
    } catch (error) {
      logger.error('Failed to release lock:', error);
    }
  }
}