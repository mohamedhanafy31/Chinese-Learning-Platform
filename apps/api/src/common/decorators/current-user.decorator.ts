import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicUser } from '@app/shared';

import type { AuthenticatedRequest } from '../types/authenticated-request';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
