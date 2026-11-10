import { SetMetadata } from '@nestjs/common';

export const SKIP_ORIGIN_CHECK_KEY = 'skipOriginCheck';

export const SkipOriginCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ORIGIN_CHECK_KEY, true);
