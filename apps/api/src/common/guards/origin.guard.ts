import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { SKIP_ORIGIN_CHECK_KEY } from '../decorators/skip-origin-check.decorator';
import { isAllowedOrigin } from '../security/origin';
import type { Environment } from '../../config/environment';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_ORIGIN_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (
      !isAllowedOrigin(
        request.method,
        request.get('origin'),
        this.config.get('APP_URL', { infer: true }),
      )
    ) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    return true;
  }
}
