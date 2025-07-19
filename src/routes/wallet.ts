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

// Initialize services and controller
const walletService = new WalletService();
const transactionService = new TransactionService();
const walletController = new WalletController(walletService, transactionService);

/**
 * @swagger
 * /api/wallets:
 *   post:
 *     summary: Create a new wallet
 *     tags: [Wallets]
 */
router.post('/', [
  validateDto(CreateWalletDto)
], walletController.createWallet);

/**
 * @swagger
 * /api/wallets:
 *   get:
 *     summary: Get user wallets
 *     tags: [Wallets]
 */
router.get('/', walletController.getWallets);

/**
 * @swagger
 * /api/wallets/{currency}:
 *   get:
 *     summary: Get wallet by currency
 *     tags: [Wallets]
 */
router.get('/:currency', walletController.getWallet);

/**
 * @swagger
 * /api/wallets/{currency}/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags: [Wallets]
 */
router.get('/:currency/balance', walletController.getWalletBalance);

/**
 * @swagger
 * /api/wallets/{currency}/fund:
 *   post:
 *     summary: Fund wallet
 *     tags: [Wallets]
 */
router.post('/:currency/fund', [
  validateDto(FundWalletDto)
], walletController.fundWallet);

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
], walletController.transferBetweenWallets);

/**
 * @swagger
 * /api/wallets/{currency}/transactions:
 *   get:
 *     summary: Get wallet transaction history
 *     tags: [Wallets]
 */
router.get('/:currency/transactions', [
  validateDto(GetWalletTransactionsDto, 'query')
], walletController.getWalletTransactions);

export default router;