import { getQueueStats, retryFailedJobs, cleanQueue } from '@/jobs/queue';
import { getWorkerHealth } from '@/jobs/processor';
import Transaction from '@/models/Transaction';
import Wallet from '@/models/Wallet';
import User from '@/models/User';
import { Types } from 'mongoose';
import logger from '@/config/logger';

export class AdminService {
  async getSystemHealth() {
    const workerHealth = getWorkerHealth();
    
    return {
      workers: workerHealth,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  async getQueueStats() {
    const [transactionStats, webhookStats, notificationStats] = await Promise.all([
      getQueueStats('transaction'),
      getQueueStats('webhook'),
      getQueueStats('notification')
    ]);

    return {
      transaction: transactionStats,
      webhook: webhookStats,
      notification: notificationStats
    };
  }

  async retryFailedJobs(queue: string, limit: number = 10) {
    return await retryFailedJobs(queue, limit);
  }

  async cleanQueue(queue: string, olderThan: number = 24 * 60 * 60 * 1000) {
    return await cleanQueue(queue, olderThan);
  }

  async getTopTransactingUsers(tenantId: Types.ObjectId, period: string = 'month', limit: number = 10) {
    try {
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

      const pipeline: any = [
        {
          $match: {
            tenant: tenantId,
            status: 'completed',
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$user',
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            avgTransactionAmount: { $avg: '$amount' },
            currencies: { $addToSet: '$currency' },
            transactionTypes: { $addToSet: '$type' },
            lastTransactionDate: { $max: '$createdAt' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        {
          $unwind: '$userDetails'
        },
        {
          $project: {
            _id: 1,
            user: {
              id: '$userDetails._id',
              email: '$userDetails.email',
              firstName: '$userDetails.firstName',
              lastName: '$userDetails.lastName',
              status: '$userDetails.status',
              kycStatus: '$userDetails.kycStatus'
            },
            totalAmount: 1,
            formattedTotalAmount: { $divide: ['$totalAmount', 100] },
            transactionCount: 1,
            avgTransactionAmount: { $divide: ['$avgTransactionAmount', 100] },
            currencies: 1,
            transactionTypes: 1,
            lastTransactionDate: 1
          }
        },
        {
          $sort: { totalAmount: -1 }
        },
        {
          $limit: limit
        }
      ];

      const topUsers = await Transaction.aggregate(pipeline);
      
      logger.info(`Retrieved top ${topUsers.length} transacting users for tenant ${tenantId}`);
      return topUsers;
    } catch (error) {
      logger.error('Failed to get top transacting users:', error);
      throw error;
    }
  }

  async getTransactionTrends(tenantId: Types.ObjectId, period: string = 'month', groupBy: string = 'day') {
    try {
      // Calculate date range
      const now = new Date();
      let startDate: Date;
      let dateFormat: string;

      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          dateFormat = groupBy === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFormat = '%Y-%m-%d';
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          dateFormat = '%Y-%m';
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFormat = '%Y-%m-%d';
      }

      const pipeline: any = [
        {
          $match: {
            tenant: tenantId,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: dateFormat, date: '$createdAt' } },
              status: '$status',
              type: '$type'
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            transactions: {
              $push: {
                status: '$_id.status',
                type: '$_id.type',
                count: '$count',
                totalAmount: { $divide: ['$totalAmount', 100] },
                avgAmount: { $divide: ['$avgAmount', 100] }
              }
            },
            totalCount: { $sum: '$count' },
            totalAmount: { $sum: { $divide: ['$totalAmount', 100] } }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ];

      const trends = await Transaction.aggregate(pipeline);
      
      logger.info(`Retrieved transaction trends for tenant ${tenantId}, period: ${period}`);
      return trends;
    } catch (error) {
      logger.error('Failed to get transaction trends:', error);
      throw error;
    }
  }

  async getWalletSummary(tenantId: Types.ObjectId) {
    try {
      const pipeline: any = [
        {
          $match: { tenant: tenantId }
        },
        {
          $group: {
            _id: {
              currency: '$currency',
              status: '$status'
            },
            count: { $sum: 1 },
            totalBalance: { $sum: '$balance' },
            totalLedgerBalance: { $sum: '$ledgerBalance' },
            avgBalance: { $avg: '$balance' }
          }
        },
        {
          $group: {
            _id: '$_id.currency',
            statuses: {
              $push: {
                status: '$_id.status',
                count: '$count',
                totalBalance: { $divide: ['$totalBalance', 100] },
                totalLedgerBalance: { $divide: ['$totalLedgerBalance', 100] },
                avgBalance: { $divide: ['$avgBalance', 100] }
              }
            },
            totalWallets: { $sum: '$count' },
            totalBalance: { $sum: { $divide: ['$totalBalance', 100] } },
            totalLedgerBalance: { $sum: { $divide: ['$totalLedgerBalance', 100] } }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ];

      const summary = await Wallet.aggregate(pipeline);
      
      logger.info(`Retrieved wallet summary for tenant ${tenantId}`);
      return summary;
    } catch (error) {
      logger.error('Failed to get wallet summary:', error);
      throw error;
    }
  }

  async getFraudAnalytics(tenantId: Types.ObjectId, period: string = 'month') {
    try {
      // Calculate date range
      const now = new Date();
      let startDate: Date;

      switch (period) {
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

      const pipeline: any = [
        {
          $match: {
            tenant: tenantId,
            createdAt: { $gte: startDate },
            riskScore: { $exists: true }
          }
        },
        {
          $facet: {
            riskDistribution: [
              {
                $bucket: {
                  groupBy: '$riskScore',
                  boundaries: [0, 30, 60, 80, 100],
                  default: 'other',
                  output: {
                    count: { $sum: 1 },
                    avgAmount: { $avg: { $divide: ['$amount', 100] } },
                    totalAmount: { $sum: { $divide: ['$amount', 100] } }
                  }
                }
              }
            ],
            fraudFlags: [
              { $unwind: '$fraudFlags' },
              {
                $group: {
                  _id: '$fraudFlags',
                  count: { $sum: 1 },
                  avgRiskScore: { $avg: '$riskScore' },
                  totalAmount: { $sum: { $divide: ['$amount', 100] } }
                }
              },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ],
            dailyTrends: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  avgRiskScore: { $avg: '$riskScore' },
                  highRiskCount: {
                    $sum: { $cond: [{ $gte: ['$riskScore', 80] }, 1, 0] }
                  },
                  totalTransactions: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ];

      const analytics = await Transaction.aggregate(pipeline);
      
      logger.info(`Retrieved fraud analytics for tenant ${tenantId}, period: ${period}`);
      return analytics[0]; // $facet returns an array with one element
    } catch (error) {
      logger.error('Failed to get fraud analytics:', error);
      throw error;
    }
  }
}