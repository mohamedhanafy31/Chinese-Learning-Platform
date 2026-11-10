import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import { Role } from '@app/shared';

import { AuthGuard } from './auth.guard';
import { OptionalAuth } from '../decorators/optional-auth.decorator';
import { Public } from '../decorators/public.decorator';
import type { IdentityTokensService } from '../../identity/identity-tokens.service';
import type { PrismaService } from '../../prisma/prisma.service';

class RequiredController {
  handler(): void {}
}

class OptionalController {
  @OptionalAuth()
  handler(): void {}
}

class PublicController {
  @Public()
  handler(): void {}
}

const future = new Date(Date.now() + 60_000);
const sessionRow = {
  id: 'session-1',
  userId: 'user-1',
  revokedAt: null,
  expiresAt: future,
  user: {
    id: 'user-1',
    email: 'a@example.com',
    name: 'A',
    phone: '+201001234567',
    role: Role.STUDENT,
    isActive: true,
  },
};

function build(options: {
  verify?: () => Promise<unknown>;
  session?: unknown;
}) {
  const tokens = {
    verifyAccessToken: jest.fn(
      options.verify ??
        (() =>
          Promise.resolve({
            sub: 'user-1',
            sid: 'session-1',
            role: 'STUDENT',
          })),
    ),
  } as unknown as IdentityTokensService;
  const prisma = {
    session: {
      findUnique: jest.fn(() =>
        Promise.resolve('session' in options ? options.session : sessionRow),
      ),
    },
  } as unknown as PrismaService;
  return new AuthGuard(new Reflector(), tokens, prisma);
}

function context(
  controller: { new (): { handler(): void } },
  cookies: Record<string, string>,
): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { cookies };
  return {
    request,
    context: {
      getHandler: () => controller.prototype.handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('AuthGuard optional authentication', () => {
  it('still rejects anonymous callers on required routes', async () => {
    const { context: ctx } = context(RequiredController, {});
    await expect(build({}).canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets public routes through without reading the cookie', async () => {
    const { context: ctx, request } = context(PublicController, {
      access_token: 'ignored',
    });
    await expect(build({}).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('attaches the user on optional routes when the cookie is valid', async () => {
    const { context: ctx, request } = context(OptionalController, {
      access_token: 'good',
    });
    await expect(build({}).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'user-1', role: Role.STUDENT });
  });

  it('treats a missing cookie as anonymous on optional routes', async () => {
    const { context: ctx, request } = context(OptionalController, {});
    await expect(build({}).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('treats an invalid or expired token as anonymous, never 401', async () => {
    const { context: ctx, request } = context(OptionalController, {
      access_token: 'garbage',
    });
    const guard = build({ verify: () => Promise.reject(new Error('expired')) });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('treats a revoked or unknown session as anonymous on optional routes', async () => {
    const revoked = build({
      session: { ...sessionRow, revokedAt: new Date() },
    });
    const first = context(OptionalController, { access_token: 'good' });
    await expect(revoked.canActivate(first.context)).resolves.toBe(true);
    expect(first.request.user).toBeUndefined();

    const missing = build({ session: null });
    const second = context(OptionalController, { access_token: 'good' });
    await expect(missing.canActivate(second.context)).resolves.toBe(true);
    expect(second.request.user).toBeUndefined();
  });

  it('keeps rejecting invalid tokens on required routes', async () => {
    const { context: ctx } = context(RequiredController, {
      access_token: 'garbage',
    });
    const guard = build({ verify: () => Promise.reject(new Error('bad')) });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
