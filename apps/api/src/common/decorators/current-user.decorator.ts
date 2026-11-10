import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicUser } from '@app/shared';

import type { AuthenticatedRequest } from '../types/authenticated-request';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/** For `@OptionalAuth()` routes: the signed-in user, or null when anonymous. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser | null =>
    context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>().user ??
    null,
);
