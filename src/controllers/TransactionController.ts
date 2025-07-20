import { Response } from 'express';
import { Request } from 'express';
import { TransactionService } from '@/services/TransactionService';
import { catchAsync } from '@/utils/errors';
import { 
  InitializeTransactionDto, 
  GetTransactionHistoryDto,
  GetTransactionStatsDto 
} from '@/dto/transaction.dto';

export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  initializeTransaction = catchAsync(async (req: Request, res: Response) => {
    const dto = new InitializeTransactionDto(req.body);
    const transaction = await this.transactionService.initializeTransaction({
      ...dto,
      tenantId: req.tenant!._id,
      userId: req.user!._id,
      metadata: {
        ...dto.metadata,
        clientIp: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.status(201).json({
      status: 'success',
      message: 'Transaction initialized successfully',
      data: { transaction }
    });
  });

  getTransactionHistory = catchAsync(async (req: Request, res: Response) => {
    const dto = new GetTransactionHistoryDto(req.query);
    const result = await this.transactionService.getTransactionHistory({
      ...dto,
      tenantId: req.tenant!._id,
      userId: req.user!._id
    });

    res.json({
      status: 'success',
      data: result
    });
  });

  getTransactionByReference = catchAsync(async (req: Request, res: Response) => {
    const { reference } = req.params;
    if (!reference) {
      throw new Error('Transaction reference is required');
    }
    const transaction = await this.transactionService.getTransactionByReference(
      reference,
      req.tenant!._id,
      req.user!._id
    );

    res.json({
      status: 'success',
      data: { transaction }
    });
  });

  retryTransaction = catchAsync(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }
    const transaction = await this.transactionService.retryFailedTransaction(
      transactionId,
      req.user!._id
    );

    res.json({
      status: 'success',
      message: 'Transaction retry initiated successfully',
      data: { transaction }
    });
  });

  processTransaction = catchAsync(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }
    const result = await this.transactionService.processTransaction(transactionId);

    res.json({
      status: 'success',
      message: 'Transaction processed successfully',
      data: result
    });
  });

  getTransactionStats = catchAsync(async (req: Request, res: Response) => {
    const dto = new GetTransactionStatsDto(req.query);
    const stats = await this.transactionService.getTransactionStats(
      req.user!._id,
      req.tenant!._id,
      dto.period
    );

    res.json({
      status: 'success',
      data: {
        period: dto.period,
        stats,
        generatedAt: new Date()
      }
    });
  });
}