import { Response } from 'express';
import { AdminService } from '@/services/AdminService';
import { catchAsync } from '@/utils/errors';
import { IAuthenticatedRequest } from '@/types';
import { RetryFailedJobsDto, CleanQueueDto } from '@/dto/admin.dto';

export class AdminController {
  constructor(private adminService: AdminService) {}

  getSystemHealth = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const health = await this.adminService.getSystemHealth();
    
    res.json({
      status: 'success',
      data: health
    });
  });

  getQueueStats = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const stats = await this.adminService.getQueueStats();

    res.json({
      status: 'success',
      data: stats
    });
  });

  retryFailedJobs = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const dto = new RetryFailedJobsDto(req.query);
    const result = await this.adminService.retryFailedJobs(dto.queue, dto.limit);

    res.json({
      status: 'success',
      message: 'Failed jobs retry initiated',
      data: result
    });
  });

  cleanQueue = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const dto = new CleanQueueDto(req.query);
    const result = await this.adminService.cleanQueue(dto.queue, dto.olderThan);

    res.json({
      status: 'success',
      message: 'Queue cleaned successfully',
      data: result
    });
  });
}