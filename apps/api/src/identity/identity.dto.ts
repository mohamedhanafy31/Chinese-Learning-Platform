import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@app/shared';

export class RegisterDto implements RegisterRequest {
  static readonly schema = registerRequestSchema;

  declare email: string;
  declare name: string;
  declare password: string;
  declare phone: string;
}

export class LoginDto implements LoginRequest {
  static readonly schema = loginRequestSchema;

  declare email: string;
  declare password: string;
}

export class ForgotPasswordDto implements ForgotPasswordRequest {
  static readonly schema = forgotPasswordRequestSchema;

  declare email: string;
  declare locale: ForgotPasswordRequest['locale'];
  declare portal: ForgotPasswordRequest['portal'];
}

export class ResetPasswordDto implements ResetPasswordRequest {
  static readonly schema = resetPasswordRequestSchema;

  declare password: string;
  declare token: string;
}
