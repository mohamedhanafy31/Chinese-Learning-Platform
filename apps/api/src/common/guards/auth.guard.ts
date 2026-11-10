import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { IdentityTokensService } from '../../identity/identity-tokens.service';
import { toPublicUser } from '../../identity/public-user';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityTokensService)
    private readonly tokens: IdentityTokensService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isOptional = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request>();
    const accessToken = request.cookies?.access_token as string | undefined;
    if (!accessToken) {
      if (isOptional) return true;
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const claims = await this.tokens.verifyAccessToken(accessToken);
      const session = await this.prisma.session.findUnique({
        where: { id: claims.sid },
        include: { user: true },
      });
      if (
        !session ||
        session.userId !== claims.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !session.user.isActive ||
        session.user.role !== claims.role
      ) {
        throw new UnauthorizedException('Authentication required');
      }

      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = toPublicUser(session.user);
      authenticatedRequest.auth = { sessionId: session.id };
      return true;
    } catch {
      // An invalid or expired cookie on an optional route is just anonymous.
      if (isOptional) return true;
      throw new UnauthorizedException('Authentication required');
    }
  }
}
