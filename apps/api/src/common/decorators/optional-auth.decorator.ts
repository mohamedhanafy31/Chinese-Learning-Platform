import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * The route is reachable anonymously. A valid access cookie still populates
 * `request.user`; a missing, expired or invalid one is treated as anonymous and
 * never produces a 401.
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
