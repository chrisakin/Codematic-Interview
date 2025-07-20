import express from 'express';
import { WalletController } from '@/controllers/WalletController';
import { WalletService } from '@/services/WalletService';
import { TransactionService } from '@/services/TransactionService';
import { authenticate, requireVerification } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { 
  CreateWalletDto, 
  FundWalletDto, 
  TransferBetweenWalletsDto,
  GetWalletTransactionsDto 
} from '@/dto/wallet.dto';

const router = express.Router();

// Apply authentication to all wallet routes
router.use(authenticate);

/**
 * @swagger
 * /api/wallets:
 *   post:
 *     summary: Create a new wallet
 *     tags: [Wallets]
 */
router.post('/', [
  validateDto(CreateWalletDto)
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.createWallet(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/wallets:
 *   get:
 *     summary: Get user wallets
 *     tags: [Wallets]
 */
router.get('/', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.getWallets(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/wallets/{currency}:
 *   get:
 *     summary: Get wallet by currency
 *     tags: [Wallets]
 */
router.get('/:currency', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.getWallet(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/wallets/{currency}/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags: [Wallets]
 */
router.get('/:currency/balance', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.getWalletBalance(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/wallets/{currency}/fund:
 *   post:
 *     summary: Fund wallet
 *     tags: [Wallets]
 */
router.post('/:currency/fund', [
  validateDto(FundWalletDto)
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.fundWallet(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/wallets/transfer:
 *   post:
 *     summary: Transfer between wallets
 *     tags: [Wallets]
 */
router.post('/transfer', [
  requireVerification,
  validateDto(TransferBetweenWalletsDto)
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.transferBetweenWallets(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/wallets/{currency}/transactions:
 *   get:
 *     summary: Get wallet transaction history
 *     tags: [Wallets]
 */
router.get('/:currency/transactions', [
  validateDto(GetWalletTransactionsDto, 'query')
], async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const walletController = new WalletController(walletService, transactionService);
    await walletController.getWalletTransactions(req, res, next);
  } catch (err) {
    next(err);
  }
});

export default router;