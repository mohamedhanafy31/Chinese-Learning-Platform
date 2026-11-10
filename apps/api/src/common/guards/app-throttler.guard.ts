import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storage: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  protected override async throwThrottlingException(): Promise<void> {
    // Throttler 6 is CommonJS while Nest 12 is ESM. Throw the application's
    // own Nest HttpException so the global filter reliably preserves 429.
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}
