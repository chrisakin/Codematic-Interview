import express from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '@/controllers/AuthController';
import { AuthService } from '@/services/AuthService';
import { TenantService } from '@/services/TenantService';
import { authenticate, authenticateApiKey } from '@/middleware/auth';
import { validateDto } from '@/middleware/validation';
import { 
  RegisterUserDto, 
  LoginUserDto, 
  ChangePasswordDto, 
  RegisterTenantDto,
  VerifyTokenDto 
} from '@/dto/auth.dto';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Initialize services and controller
const authService = new AuthService();
const tenantService = new TenantService();
const authController = new AuthController(authService, tenantService);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 */
router.post('/register', [
  authLimiter,
  validateDto(RegisterUserDto)
], authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 */
router.post('/login', [
  authLimiter,
  validateDto(LoginUserDto)
], authController.login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Authentication]
 */
router.get('/profile', authenticate, authController.getProfile);

/**
 * @swagger
 * /api/auth/change-password:
 *   patch:
 *     summary: Change user password
 *     tags: [Authentication]
 */
router.patch('/change-password', [
  authenticate,
  validateDto(ChangePasswordDto)
], authController.changePassword);

/**
 * @swagger
 * /api/auth/verify-token:
 *   post:
 *     summary: Verify JWT token
 *     tags: [Authentication]
 */
router.post('/verify-token', [
  validateDto(VerifyTokenDto)
], authController.verifyToken);

/**
 * @swagger
 * /api/auth/register-tenant:
 *   post:
 *     summary: Register a new tenant
 *     tags: [Authentication]
 */
router.post('/register-tenant', [
  authenticateApiKey,
  validateDto(RegisterTenantDto)
], authController.registerTenant);

export default router;