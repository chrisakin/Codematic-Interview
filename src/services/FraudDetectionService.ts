import User from '@/models/User';
import Transaction from '@/models/Transaction';
import { getRedisClient } from '@/config/redis';
import logger from '@/config/logger';
import { IFraudCheckData, IRiskAssessment, IUser } from '@/types';
import { Types } from 'mongoose';
import { RedisClientType } from 'redis';

class FraudDetectionService {
  private redis: RedisClientType;
  private riskThresholds = {
    LOW: 30,
    MEDIUM: 60,
    HIGH: 80
  };

  constructor() {
    this.redis = getRedisClient();
  }

  async assessTransaction(data: IFraudCheckData): Promise<IRiskAssessment> {
    const { tenantId, userId, amount, currency, type, paymentMethod, metadata } = data;
    
    try {
      let riskScore = 0;
      const flags: string[] = [];
      
      // Run parallel risk checks
      const [
        velocityCheck,
        amountCheck,
        userPatternCheck,
        deviceCheck
      ] = await Promise.all([
        this.checkTransactionVelocity(userId, tenantId),
        this.checkTransactionAmount(amount, currency, userId, tenantId),
        this.checkUserPattern(userId, tenantId),
        this.checkDeviceFingerprint(metadata?.clientIp, metadata?.userAgent, userId)
      ]);
      
      // Aggregate risk scores
      riskScore += velocityCheck.score;
      riskScore += amountCheck.score;
      riskScore += userPatternCheck.score;
      riskScore += deviceCheck.score;
      
      flags.push(...velocityCheck.flags);
      flags.push(...amountCheck.flags);
      flags.push(...userPatternCheck.flags);
      flags.push(...deviceCheck.flags);
      
      // Additional checks for high-risk payment methods
      if (paymentMethod === 'card') {
        const cardCheck = await this.checkCardRisk(metadata);
        riskScore += cardCheck.score;
        flags.push(...cardCheck.flags);
      }
      
      // Determine if transaction should be blocked
      const shouldBlock = riskScore >= this.riskThresholds.HIGH || 
                         flags.includes('STOLEN_CARD') || 
                         flags.includes('BLACKLISTED_IP');
      
      const reason = shouldBlock ? this.getBlockReason(flags) : '';
      
      // Cache risk assessment for future reference
      await this.cacheRiskAssessment(userId, tenantId, {
        score: riskScore,
        flags,
        timestamp: new Date()
      });
      
      logger.info(`Risk assessment completed for user ${userId}: Score ${riskScore}, Flags: ${flags.join(', ')}`);
      
      return {
        score: Math.min(riskScore, 100), // Cap at 100
        flags,
        shouldBlock,
        reason,
        riskLevel: this.getRiskLevel(riskScore)
      };
      
    } catch (error) {
      logger.error('Fraud detection failed:', error);
      // Fail safe - allow transaction but flag for manual review
      return {
        score: 50,
        flags: ['FRAUD_CHECK_FAILED'],
        shouldBlock: false,
        reason: 'Fraud check failed',
        riskLevel: 'MEDIUM'
      };
    }
  }

  async checkTransactionVelocity(userId: Types.ObjectId, tenantId: Types.ObjectId): Promise<{ score: number; flags: string[] }> {
    try {
      const cacheKey = `velocity:${userId}:${tenantId}`;
      let velocityDataStr: string | null = null;
      let velocityData: { count: number; lastReset: number };
      
      try {
        velocityDataStr = await this.redis.get(cacheKey);
      } catch (error) {
        logger.warn('Redis velocity check failed:', error);
      }
      
      if (!velocityDataStr) {
        // Get recent transactions from database
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentTransactions = await Transaction.find({
          user: userId,
          tenant: tenantId,
          createdAt: { $gte: oneHourAgo },
          status: { $in: ['completed', 'processing'] }
        }).countDocuments();
        
        velocityData = { count: recentTransactions, lastReset: Date.now() };
        try {
          await this.redis.setEx(cacheKey, 3600, JSON.stringify(velocityData)); // 1 hour TTL
        } catch (error) {
          logger.warn('Redis velocity cache write failed:', error);
        }
      } else {
        velocityData = JSON.parse(velocityDataStr);
        velocityData.count += 1;
        try {
          await this.redis.setEx(cacheKey, 3600, JSON.stringify(velocityData));
        } catch (error) {
          logger.warn('Redis velocity cache update failed:', error);
        }
      }
      
      const flags: string[] = [];
      let score = 0;
      
      if (velocityData.count > 20) {
        flags.push('HIGH_VELOCITY');
        score += 40;
      } else if (velocityData.count > 10) {
        flags.push('MEDIUM_VELOCITY');
        score += 20;
      }
      
      return { score, flags };
      
    } catch (error) {
      logger.error('Velocity check failed:', error);
      return { score: 0, flags: [] };
    }
  }

  async checkTransactionAmount(amount: number, currency: string, userId: Types.ObjectId, tenantId: Types.ObjectId): Promise<{ score: number; flags: string[] }> {
    try {
      const flags: string[] = [];
      let score = 0;
      
      // Get user's transaction history to establish patterns
      const userTransactions = await Transaction.find({
        user: userId,
        tenant: tenantId,
        status: 'completed',
        currency
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('amount');
      
      if (userTransactions.length > 0) {
        const amounts = userTransactions.map(t => t.amount);
        const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        const maxAmount = Math.max(...amounts);
        
        // Check if amount is significantly higher than usual
        if (amount > avgAmount * 10) {
          flags.push('UNUSUAL_AMOUNT');
          score += 30;
        } else if (amount > avgAmount * 5) {
          flags.push('HIGH_AMOUNT');
          score += 15;
        }
        
        // Check if amount exceeds historical maximum
        if (amount > maxAmount * 2) {
          flags.push('EXCEEDS_HISTORICAL_MAX');
          score += 20;
        }
      } else {
        // New user with large first transaction
        if (amount > 100000) { // > 1000 in major currency
          flags.push('LARGE_FIRST_TRANSACTION');
          score += 25;
        }
      }
      
      // Check against absolute thresholds
      if (amount > 1000000) { // > 10,000 in major currency
        flags.push('VERY_HIGH_AMOUNT');
        score += 35;
      }
      
      return { score, flags };
      
    } catch (error) {
      logger.error('Amount check failed:', error);
      return { score: 0, flags: [] };
    }
  }

  async checkUserPattern(userId: Types.ObjectId, tenantId: Types.ObjectId): Promise<{ score: number; flags: string[] }> {
    try {
      const flags: string[] = [];
      let score = 0;
      
      const user = await User.findById(userId) as IUser;
      if (!user) {
        flags.push('USER_NOT_FOUND');
        return { score: 50, flags };
      }
      
      // Check account age
      const accountAge = Date.now() - new Date(user.createdAt).getTime();
      const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
      
      if (daysSinceCreation < 1) {
        flags.push('NEW_ACCOUNT');
        score += 25;
      } else if (daysSinceCreation < 7) {
        flags.push('RECENT_ACCOUNT');
        score += 15;
      }
      
      // Check KYC status
      if (user.kycStatus !== 'verified') {
        flags.push('UNVERIFIED_KYC');
        score += 20;
      }
      
      // Check user status
      if (user.status === 'suspended') {
        flags.push('SUSPENDED_USER');
        score += 50;
      }
      
      // Check login patterns
      if (user.loginAttempts > 3) {
        flags.push('MULTIPLE_LOGIN_ATTEMPTS');
        score += 15;
      }
      
      return { score, flags };
      
    } catch (error) {
      logger.error('User pattern check failed:', error);
      return { score: 0, flags: [] };
    }
  }

  async checkDeviceFingerprint(clientIp?: string, userAgent?: string, userId?: Types.ObjectId): Promise<{ score: number; flags: string[] }> {
    try {
      const flags: string[] = [];
      let score = 0;
      
      if (!clientIp || !userAgent) {
        flags.push('MISSING_DEVICE_INFO');
        return { score: 10, flags };
      }
      
      // Check if IP is in blacklist (Redis set)
      let isBlacklisted = false;
      try {
        isBlacklisted = await this.redis.sIsMember('blacklisted_ips', clientIp);
      } catch (error) {
        logger.warn('Redis blacklist check failed:', error);
      }
      
      if (isBlacklisted) {
        flags.push('BLACKLISTED_IP');
        score += 80;
      }
      
      // Check for VPN/Proxy indicators
      if (await this.isVpnOrProxy(clientIp)) {
        flags.push('VPN_OR_PROXY');
        score += 20;
      }
      
      // Check device consistency for user
      if (userId) {
        const deviceKey = `device:${userId}`;
        let knownDevices: string[] = [];
        
        try {
          knownDevices = await this.redis.sMembers(deviceKey);
        } catch (error) {
          logger.warn('Redis device check failed:', error);
        }
        
        const deviceFingerprint = this.generateDeviceFingerprint(clientIp, userAgent);
        
        if (knownDevices.length > 0 && !knownDevices.includes(deviceFingerprint)) {
          flags.push('NEW_DEVICE');
          score += 15;
          
          // Add to known devices
          try {
            await this.redis.sAdd(deviceKey, deviceFingerprint);
            await this.redis.expire(deviceKey, 86400 * 30); // 30 days
          } catch (error) {
            logger.warn('Redis device cache update failed:', error);
          }
        } else if (knownDevices.length === 0) {
          // First time user
          try {
            await this.redis.sAdd(deviceKey, deviceFingerprint);
            await this.redis.expire(deviceKey, 86400 * 30);
          } catch (error) {
            logger.warn('Redis device cache init failed:', error);
          }
        }
      }
      
      return { score, flags };
      
    } catch (error) {
      logger.error('Device fingerprint check failed:', error);
      return { score: 0, flags: [] };
    }
  }

  async checkCardRisk(metadata?: any): Promise<{ score: number; flags: string[] }> {
    try {
      const flags: string[] = [];
      let score = 0;
      
      const { cardBin, cardLast4, cardType } = metadata || {};
      
      if (!cardBin) {
        return { score: 0, flags };
      }
      
      // Check if card BIN is in stolen card database
      let isStolenCard = false;
      try {
        isStolenCard = await this.redis.sIsMember('stolen_cards', cardBin);
      } catch (error) {
        logger.warn('Redis stolen card check failed:', error);
      }
      
      if (isStolenCard) {
        flags.push('STOLEN_CARD');
        score += 100; // Immediate block
      }
      
      // Check card usage frequency
      const cardKey = `card:${cardBin}${cardLast4}`;
      let dailyUsage = 1;
      
      try {
        dailyUsage = await this.redis.incr(`${cardKey}:daily`);
        
        if (dailyUsage === 1) {
          await this.redis.expire(`${cardKey}:daily`, 86400); // 24 hours
        }
      } catch (error) {
        logger.warn('Redis card usage tracking failed:', error);
      }
      
      if (dailyUsage > 5) {
        flags.push('HIGH_CARD_USAGE');
        score += 30;
      }
      
      // Check for high-risk card types
      if (cardType === 'prepaid') {
        flags.push('PREPAID_CARD');
        score += 15;
      }
      
      return { score, flags };
      
    } catch (error) {
      logger.error('Card risk check failed:', error);
      return { score: 0, flags: [] };
    }
  }

  async isVpnOrProxy(ip: string): Promise<boolean> {
    // Simple implementation - in production, use a proper IP intelligence service
    try {
      const vpnKeywords = ['vpn', 'proxy', 'tor', 'anonymous'];
      // This would typically call an external service
      return false; // Placeholder
    } catch (error) {
      return false;
    }
  }

  generateDeviceFingerprint(ip: string, userAgent: string): string {
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
  }

  async cacheRiskAssessment(userId: Types.ObjectId, tenantId: Types.ObjectId, assessment: any): Promise<void> {
    try {
      const key = `risk:${userId}:${tenantId}`;
      await this.redis.setEx(key, 3600, JSON.stringify(assessment)); // 1 hour
    } catch (error) {
      logger.error('Failed to cache risk assessment:', error);
    }
  }

  getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (score >= this.riskThresholds.HIGH) return 'HIGH';
    if (score >= this.riskThresholds.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  getBlockReason(flags: string[]): string {
    if (flags.includes('STOLEN_CARD')) return 'Suspected stolen card';
    if (flags.includes('BLACKLISTED_IP')) return 'IP address is blacklisted';
    if (flags.includes('HIGH_VELOCITY')) return 'Too many transactions in short time';
    if (flags.includes('SUSPENDED_USER')) return 'User account is suspended';
    return 'High risk transaction detected';
  }

  // Admin functions for managing fraud rules
  async addToBlacklist(ip: string): Promise<void> {
    try {
      await this.redis.sAdd('blacklisted_ips', ip);
    } catch (error) {
      logger.error('Failed to add IP to blacklist:', error);
      throw error;
    }
    logger.info(`IP ${ip} added to blacklist`);
  }

  async removeFromBlacklist(ip: string): Promise<void> {
    try {
      await this.redis.sRem('blacklisted_ips', ip);
    } catch (error) {
      logger.error('Failed to remove IP from blacklist:', error);
      throw error;
    }
    logger.info(`IP ${ip} removed from blacklist`);
  }

  async addStolenCard(cardBin: string): Promise<void> {
    try {
      await this.redis.sAdd('stolen_cards', cardBin);
    } catch (error) {
      logger.error('Failed to add card to stolen list:', error);
      throw error;
    }
    logger.info(`Card BIN ${cardBin} added to stolen cards list`);
  }
}

export default new FraudDetectionService();