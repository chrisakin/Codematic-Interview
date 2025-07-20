import { Request, Response } from 'express';
import WebhookService from '@/services/WebhookService';
import { TransactionService } from '@/services/TransactionService';
import { catchAsync } from '@/utils/errors';
import { PaymentProvider } from '@/types';
import { ReplayWebhookDto } from '@/dto/webhook.dto';

export class WebhookController {
  constructor(
    private webhookService: WebhookService,
    private transactionService: TransactionService
  ) {}

  handlePaystackWebhook = catchAsync(async (req: Request, res: Response) => {
    const { tenant_id } = req.query;
    const signature = req.webhookSignature!;
    
    const result = await this.transactionService.handleWebhook(
      'paystack',
      req.body,
      signature,
      tenant_id as string
    );

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully'
    });
  });

  handleFlutterwaveWebhook = catchAsync(async (req: Request, res: Response) => {
    const { tenant_id } = req.query;
    const signature = req.webhookSignature!;
    
    const result = await this.transactionService.handleWebhook(
      'flutterwave',
      req.body,
      signature,
      tenant_id as string
    );

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully'
    });
  });

  handleStripeWebhook = catchAsync(async (req: Request, res: Response) => {
    const { tenant_id } = req.query;
    const signature = req.webhookSignature!;
    
    const result = await this.transactionService.handleWebhook(
      'stripe',
      req.body,
      signature,
      tenant_id as string
    );

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully'
    });
  });

  replayWebhook = catchAsync(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const dto = new ReplayWebhookDto(req.body);
    
    const result = await this.webhookService.replayWebhook(transactionId as string, dto.event);

    res.json({
      status: 'success',
      message: 'Webhook replay initiated successfully',
      data: result
    });
  });

  getWebhookLogs = catchAsync(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const logs = await this.webhookService.getWebhookLogs(transactionId as string);

    res.json({
      status: 'success',
      data: { logs }
    });
  });

  getWebhookStats = catchAsync(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    const stats = await this.webhookService.getWebhookStats(
      req.tenant!._id,
      startDate as string,
      endDate as string
    );

    res.json({
      status: 'success',
      data: { stats }
    });
  });
}