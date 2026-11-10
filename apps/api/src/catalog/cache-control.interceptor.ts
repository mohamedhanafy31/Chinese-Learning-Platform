import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { tap, type Observable } from 'rxjs';

/** Sets a fixed Cache-Control header on successful responses only. */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly value: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next
      .handle()
      .pipe(tap(() => response.setHeader('Cache-Control', this.value)));
  }
}

export const PUBLIC_CACHE_CONTROL = 'public, max-age=60';
export const ADMIN_CACHE_CONTROL = 'private, no-store';
