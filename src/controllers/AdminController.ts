import { Response } from 'express';
import { Request } from 'express';
import { AdminService } from '@/services/AdminService';
import { catchAsync } from '@/utils/errors';
import { 
  RetryFailedJobsDto, 
  CleanQueueDto, 
  GetTopUsersDto, 
  GetTransactionTrendsDto, 
  GetFraudAnalyticsDto 
} from '@/dto/admin.dto';

export class AdminController {
  constructor(private adminService: AdminService) {}

  getSystemHealth = catchAsync(async (req: Request, res: Response) => {
    const health = await this.adminService.getSystemHealth();
    
    res.json({
      status: 'success',
      data: health
    });
  });

  getQueueStats = catchAsync(async (req: Request, res: Response) => {
    const stats = await this.adminService.getQueueStats();

    res.json({
      status: 'success',
      data: stats
    });
  });

  retryFailedJobs = catchAsync(async (req: Request, res: Response) => {
    const dto = new RetryFailedJobsDto(req.query);
    const result = await this.adminService.retryFailedJobs(dto.queue, dto.limit);

    res.json({
      status: 'success',
      message: 'Failed jobs retry initiated',
      data: result
    });
  });

  cleanQueue = catchAsync(async (req: Request, res: Response) => {
    const dto = new CleanQueueDto(req.query);
    const result = await this.adminService.cleanQueue(dto.queue, dto.olderThan);

    res.json({
      status: 'success',
      message: 'Queue cleaned successfully',
      data: result
    });
  });

  getTopTransactingUsers = catchAsync(async (req: Request, res: Response) => {
    const dto = new GetTopUsersDto(req.query);
    const result = await this.adminService.getTopTransactingUsers(
      req.tenant!._id,
      dto.period,
      dto.limit
    );

    res.json({
      status: 'success',
      data: {
        period: dto.period,
        limit: dto.limit,
        users: result
      }
    });
  });

  getTransactionTrends = catchAsync(async (req: Request, res: Response) => {
    const dto = new GetTransactionTrendsDto(req.query);
    const result = await this.adminService.getTransactionTrends(
      req.tenant!._id,
      dto.period,
      dto.groupBy
    );

    res.json({
      status: 'success',
      data: {
        period: dto.period,
        groupBy: dto.groupBy,
        trends: result
      }
    });
  });

  getWalletSummary = catchAsync(async (req: Request, res: Response) => {
    const result = await this.adminService.getWalletSummary(req.tenant!._id);

    res.json({
      status: 'success',
      data: {
        summary: result,
        generatedAt: new Date()
      }
    });
  });

  getFraudAnalytics = catchAsync(async (req: Request, res: Response) => {
    const dto = new GetFraudAnalyticsDto(req.query);
    const result = await this.adminService.getFraudAnalytics(
      req.tenant!._id,
      dto.period
    );

    res.json({
      status: 'success',
      data: {
        period: dto.period,
        analytics: result,
        generatedAt: new Date()
      }
    });
  });
}