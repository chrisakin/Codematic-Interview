import { Response } from 'express';
import { WalletService } from '@/services/WalletService';
import { TransactionService } from '@/services/TransactionService';
import { catchAsync } from '@/utils/errors';
import { IAuthenticatedRequest, Currency } from '@/types';
import { 
  CreateWalletDto, 
  FundWalletDto, 
  TransferBetweenWalletsDto,
  GetWalletTransactionsDto 
} from '@/dto/wallet.dto';

export class WalletController {
  constructor(
    private walletService: WalletService,
    private transactionService: TransactionService
  ) {}

  createWallet = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const dto = new CreateWalletDto(req.body);
    const wallet = await this.walletService.createWallet(
      req.user._id,
      req.tenant._id,
      dto.currency
    );

    res.status(201).json({
      status: 'success',
      message: 'Wallet created successfully',
      data: { wallet }
    });
  });

  getWallets = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const { currency } = req.query;
    const wallets = await this.walletService.getUserWallets(
      req.user._id,
      req.tenant._id,
      currency as Currency
    );

    res.json({
      status: 'success',
      data: {
        wallets,
        count: wallets.length
      }
    });
  });

  getWallet = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const { currency } = req.params;
    const wallet = await this.walletService.getWallet(
      req.user._id,
      req.tenant._id,
      currency as Currency
    );

    const balance = await this.walletService.getWalletBalance(wallet._id);

    res.json({
      status: 'success',
      data: {
        wallet: {
          ...wallet.toObject(),
          formattedBalance: balance
        }
      }
    });
  });

  getWalletBalance = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const { currency } = req.params;
    const wallet = await this.walletService.getWallet(
      req.user._id,
      req.tenant._id,
      currency as Currency
    );

    const balance = await this.walletService.getWalletBalance(wallet._id);

    res.json({
      status: 'success',
      data: { balance }
    });
  });

  fundWallet = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const { currency } = req.params;
    const dto = new FundWalletDto(req.body);

    const wallet = await this.walletService.getWallet(
      req.user._id,
      req.tenant._id,
      currency as Currency
    );

    const result = await this.walletService.fundWallet(wallet._id, dto);

    res.json({
      status: 'success',
      message: 'Wallet funded successfully',
      data: result
    });
  });

  transferBetweenWallets = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const dto = new TransferBetweenWalletsDto(req.body);
    const result = await this.walletService.transferBetweenWallets(
      req.user._id,
      req.tenant._id,
      dto
    );

    res.json({
      status: 'success',
      message: 'Transfer completed successfully',
      data: result
    });
  });

  getWalletTransactions = catchAsync(async (req: IAuthenticatedRequest, res: Response) => {
    const { currency } = req.params;
    const dto = new GetWalletTransactionsDto(req.query);

    const wallet = await this.walletService.getWallet(
      req.user._id,
      req.tenant._id,
      currency as Currency
    );

    const result = await this.transactionService.getWalletTransactions(wallet._id, dto);

    res.json({
      status: 'success',
      data: result
    });
  });
}