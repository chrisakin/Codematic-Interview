import { Request, Response } from 'express';
import { AuthService } from '@/services/AuthService';
import { TenantService } from '@/services/TenantService';
import { 
  RegisterUserDto, 
  LoginUserDto, 
  ChangePasswordDto, 
  RegisterTenantDto,
  VerifyTokenDto 
} from '@/dto/auth.dto';
import { catchAsync } from '@/utils/errors';

export class AuthController {
  constructor(
    private authService: AuthService,
    private tenantService: TenantService
  ) {}

  register = catchAsync(async (req: Request, res: Response) => {
    const dto = new RegisterUserDto(req.body);
    const result = await this.authService.registerUser(dto);

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: result
    });
  });

  login = catchAsync(async (req: Request, res: Response) => {
    const dto = new LoginUserDto(req.body);
    const result = await this.authService.loginUser(dto);

    res.json({
      status: 'success',
      message: 'Login successful',
      data: result
    });
  });

  getProfile = catchAsync(async (req: Request, res: Response) => {
    res.json({
      status: 'success',
      data: {
        user: req.user!.toSafeJSON(),
        tenant: req.tenant!.toSafeJSON()
      }
    });
  });

  changePassword = catchAsync(async (req: Request, res: Response) => {
    const dto = new ChangePasswordDto(req.body);
    await this.authService.changePassword(req.user!._id, dto);

    res.json({
      status: 'success',
      message: 'Password changed successfully'
    });
  });

  verifyToken = catchAsync(async (req: Request, res: Response) => {
    const dto = new VerifyTokenDto(req.body);
    const result = await this.authService.verifyToken(dto.token);

    res.json({
      status: 'success',
      message: 'Token is valid',
      data: result
    });
  });

  registerTenant = catchAsync(async (req: Request, res: Response) => {
    const dto = new RegisterTenantDto(req.body);
    const result = await this.tenantService.registerTenant(dto);

    res.status(201).json({
      status: 'success',
      message: 'Tenant registered successfully',
      data: result
    });
  });
}