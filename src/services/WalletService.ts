import mongoose, { ClientSession } from 'mongoose';
import Wallet from '@/models/Wallet';
import Transaction from '@/models/Transaction';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import { AppError } from '@/utils/errors';
import { IWallet, ITransaction, Currency, IFormattedBalance } from '@/types';
import { Types } from 'mongoose';

class WalletService {
  private _redis: any = null;
  private lockValue: string | null = null;

  // Lazy initialization of Redis client
  get redis() {
    if (!this._redis) {
      this._redis = getRedisClient();
    }
    return this._redis;
  }

  // Create wallet with Redis caching
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

  // Get wallet with Redis caching and distributed locking
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

  // Transfer between wallets (atomic transaction)
  async transferBetweenWallets(
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

  // Get wallet balance from cache or database
  async getWalletBalance(walletId: Types.ObjectId): Promise<IFormattedBalance> {
    try {
      const cacheKey = `wallet_balance:${walletId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      const wallet = await Wallet.findById(walletId) as IWallet;
      if (!wallet) {
        throw new AppError('Wallet not found', 404);
      }
      
      const balance = wallet.formatBalance();
      
      // Cache for 1 minute
      await this.redis.setEx(cacheKey, 60, JSON.stringify(balance));
      
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

export default new WalletService();