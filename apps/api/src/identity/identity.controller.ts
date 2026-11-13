import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Role, type PublicUser, type UserResponse } from '@app/shared';

import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './identity.dto';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
} from './identity.constants';
import { IdentityService, type IssuedIdentity } from './identity.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import type { Environment } from '../config/environment';

const minute = 60_000;

function loginTracker(request: Record<string, unknown>): string {
  const body = request.body as { email?: unknown } | undefined;
  const email =
    typeof body?.email === 'string'
      ? body.email.trim().toLowerCase()
      : '<missing-email>';
  const ip = typeof request.ip === 'string' ? request.ip : '<unknown-ip>';
  return `${ip}:${email}`;
}

@Controller('auth')
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: minute } })
  async register(
    @Body(new ZodValidationPipe(RegisterDto.schema)) input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const issued = await this.identity.register(
      input,
      this.sessionMetadata(request),
    );
    this.setIdentityCookies(response, issued);
    return { user: issued.user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: 5, ttl: minute, getTracker: loginTracker },
  })
  async login(
    @Body(new ZodValidationPipe(LoginDto.schema)) input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const issued = await this.identity.login(
      input,
      this.sessionMetadata(request),
      Role.STUDENT,
    );
    this.setIdentityCookies(response, issued);
    return { user: issued.user };
  }

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: 5, ttl: minute, getTracker: loginTracker },
  })
  async adminLogin(
    @Body(new ZodValidationPipe(LoginDto.schema)) input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const issued = await this.identity.login(
      input,
      this.sessionMetadata(request),
      Role.ADMIN,
    );
    this.setIdentityCookies(response, issued);
    return { user: issued.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: minute } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const issued = await this.identity.refresh(
      request.cookies?.refresh_token as string | undefined,
      this.sessionMetadata(request),
    );
    this.setIdentityCookies(response, issued);
    return { user: issued.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.identity.logout(
      request.cookies?.refresh_token as string | undefined,
      request.cookies?.access_token as string | undefined,
    );
    this.clearIdentityCookies(response);
  }

  @Get('me')
  me(@CurrentUser() user: PublicUser): UserResponse {
    return { user };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: minute } })
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordDto.schema))
    input: ForgotPasswordDto,
  ): Promise<void> {
    await this.identity.forgotPassword(input);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: minute } })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordDto.schema))
    input: ResetPasswordDto,
  ): Promise<void> {
    await this.identity.resetPassword(input);
  }

  private sessionMetadata(request: Request): {
    ip?: string;
    userAgent?: string;
  } {
    return {
      ip: request.ip?.slice(0, 100),
      userAgent: request.get('user-agent')?.slice(0, 500),
    };
  }

  private setIdentityCookies(
    response: Response,
    identity: IssuedIdentity,
  ): void {
    const secure =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    response.cookie('access_token', identity.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1_000,
    });
    response.cookie('refresh_token', identity.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/api/v1/auth',
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  private clearIdentityCookies(response: Response): void {
    const secure =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    response.clearCookie('access_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    });
    response.clearCookie('refresh_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/api/v1/auth',
    });
  }
}
