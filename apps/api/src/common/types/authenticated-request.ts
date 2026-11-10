import type { Request } from 'express';
import type { PublicUser } from '@app/shared';

export interface AuthenticatedRequest extends Request {
  auth: {
    sessionId: string;
  };
  user: PublicUser;
}
