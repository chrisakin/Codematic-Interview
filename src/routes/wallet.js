const express = require('express');
const { body, query, validationResult } = require('express-validator');

const WalletService = require('../services/WalletService');
const { authenticate, requireVerification } = require('../middleware/auth');
const { AppError, catchAsync } = require('../utils/errors');
const logger = require('../config/logger');

const router = express.Router();

// Apply authentication to all wallet routes
router.use(authenticate);

/**
 * @swagger
 * /api/wallets:
 *   post:
 *     summary: Create a new wallet
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currency
 *             properties:
 *               currency:
 *                 type: string
 *                 enum: [NGN, USD, GBP, EUR]
 *     responses:
 *       201:
 *         description: Wallet created successfully
 */
router.post('/', [
  body('currency').isIn(['NGN', 'USD', 'GBP', 'EUR']).withMessage('Invalid currency')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { currency } = req.body;

  const wallet = await WalletService.createWallet(
    req.user._id,
    req.tenant._id,
    currency
  );

  res.status(201).json({
    status: 'success',
    message: 'Wallet created successfully',
    data: { wallet }
  });
}));

/**
 * @swagger
 * /api/wallets:
 *   get:
 *     summary: Get user wallets
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           enum: [NGN, USD, GBP, EUR]
 *         description: Filter by currency
 *     responses:
 *       200:
 *         description: Wallets retrieved successfully
 */
router.get('/', [
  query('currency').optional().isIn(['NGN', 'USD', 'GBP', 'EUR'])
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { currency } = req.query;
  const Wallet = require('../models/Wallet');

  const query = {
    user: req.user._id,
    tenant: req.tenant._id
  };

  if (currency) {
    query.currency = currency;
  }

  const wallets = await Wallet.find(query).lean();

  // Get formatted balances for each wallet
  const walletsWithBalances = await Promise.all(
    wallets.map(async (wallet) => {
      const balance = await WalletService.getWalletBalance(wallet._id);
      return {
        ...wallet,
        formattedBalance: balance
      };
    })
  );

  res.json({
    status: 'success',
    data: {
      wallets: walletsWithBalances,
      count: walletsWithBalances.length
    }
  });
}));

/**
 * @swagger
 * /api/wallets/{currency}:
 *   get:
 *     summary: Get wallet by currency
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NGN, USD, GBP, EUR]
 *     responses:
 *       200:
 *         description: Wallet retrieved successfully
 */
router.get('/:currency', catchAsync(async (req, res) => {
  const { currency } = req.params;

  if (!['NGN', 'USD', 'GBP', 'EUR'].includes(currency)) {
    throw new AppError('Invalid currency', 400);
  }

  const wallet = await WalletService.getWallet(
    req.user._id,
    req.tenant._id,
    currency
  );

  const balance = await WalletService.getWalletBalance(wallet._id);

  res.json({
    status: 'success',
    data: {
      wallet: {
        ...wallet.toObject(),
        formattedBalance: balance
      }
    }
  });
}));

/**
 * @swagger
 * /api/wallets/{currency}/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NGN, USD, GBP, EUR]
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 */
router.get('/:currency/balance', catchAsync(async (req, res) => {
  const { currency } = req.params;

  if (!['NGN', 'USD', 'GBP', 'EUR'].includes(currency)) {
    throw new AppError('Invalid currency', 400);
  }

  const wallet = await WalletService.getWallet(
    req.user._id,
    req.tenant._id,
    currency
  );

  const balance = await WalletService.getWalletBalance(wallet._id);

  res.json({
    status: 'success',
    data: { balance }
  });
}));

/**
 * @swagger
 * /api/wallets/{currency}/fund:
 *   post:
 *     summary: Fund wallet (for admin/testing purposes)
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NGN, USD, GBP, EUR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - description
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Wallet funded successfully
 */
router.post('/:currency/fund', [
  body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { currency } = req.params;
  const { amount, description } = req.body;

  if (!['NGN', 'USD', 'GBP', 'EUR'].includes(currency)) {
    throw new AppError('Invalid currency', 400);
  }

  // Convert to minor currency unit (cents/kobo)
  const amountInMinor = Math.round(amount * 100);

  const wallet = await WalletService.getWallet(
    req.user._id,
    req.tenant._id,
    currency
  );

  const Transaction = require('../models/Transaction');
  const reference = Transaction.generateReference('FUND');

  const result = await WalletService.creditWallet(
    wallet._id,
    amountInMinor,
    description,
    reference
  );

  logger.info(`Wallet funded: ${wallet._id}, amount: ${amountInMinor}`);

  res.json({
    status: 'success',
    message: 'Wallet funded successfully',
    data: {
      wallet: result.wallet,
      transaction: result.transaction,
      newBalance: result.wallet.formatBalance()
    }
  });
}));

/**
 * @swagger
 * /api/wallets/transfer:
 *   post:
 *     summary: Transfer between wallets
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromCurrency
 *               - toCurrency
 *               - amount
 *               - description
 *             properties:
 *               fromCurrency:
 *                 type: string
 *                 enum: [NGN, USD, GBP, EUR]
 *               toCurrency:
 *                 type: string
 *                 enum: [NGN, USD, GBP, EUR]
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transfer completed successfully
 */
router.post('/transfer', [
  requireVerification,
  body('fromCurrency').isIn(['NGN', 'USD', 'GBP', 'EUR']),
  body('toCurrency').isIn(['NGN', 'USD', 'GBP', 'EUR']),
  body('amount').isNumeric().isFloat({ min: 1 }),
  body('description').trim().isLength({ min: 1 })
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { fromCurrency, toCurrency, amount, description } = req.body;

  if (fromCurrency === toCurrency) {
    throw new AppError('Cannot transfer to the same currency wallet', 400);
  }

  // Convert to minor currency unit
  const amountInMinor = Math.round(amount * 100);

  // Get both wallets
  const [sourceWallet, destinationWallet] = await Promise.all([
    WalletService.getWallet(req.user._id, req.tenant._id, fromCurrency),
    WalletService.getWallet(req.user._id, req.tenant._id, toCurrency)
  ]);

  // For different currencies, you'd typically apply exchange rates here
  // For simplicity, we'll transfer the same amount
  const result = await WalletService.transferBetweenWallets(
    sourceWallet._id,
    destinationWallet._id,
    amountInMinor,
    description
  );

  res.json({
    status: 'success',
    message: 'Transfer completed successfully',
    data: result
  });
}));

/**
 * @swagger
 * /api/wallets/{currency}/transactions:
 *   get:
 *     summary: Get wallet transaction history
 *     tags: [Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NGN, USD, GBP, EUR]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, transfer]
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
 */
router.get('/:currency/transactions', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['deposit', 'withdrawal', 'transfer'])
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { currency } = req.params;
  const { page = 1, limit = 20, type } = req.query;

  if (!['NGN', 'USD', 'GBP', 'EUR'].includes(currency)) {
    throw new AppError('Invalid currency', 400);
  }

  const wallet = await WalletService.getWallet(
    req.user._id,
    req.tenant._id,
    currency
  );

  const Transaction = require('../models/Transaction');
  const query = {
    $or: [
      { sourceWallet: wallet._id },
      { destinationWallet: wallet._id }
    ],
    tenant: req.tenant._id
  };

  if (type) {
    query.type = type;
  }

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Transaction.countDocuments(query)
  ]);

  res.json({
    status: 'success',
    data: {
      transactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    }
  });
}));

module.exports = router;