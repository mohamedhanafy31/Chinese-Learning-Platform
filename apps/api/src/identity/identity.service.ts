import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale, type PublicUser, type UserResponse } from '@app/shared';

import {
  MAIL_SERVICE,
  PASSWORD_RESET_TTL_MS,
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
} from './identity.constants';
import { IdentityTokensService } from './identity-tokens.service';
import { IdentityClockService } from './identity-clock.service';
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './identity.dto';
import type { MailService } from './mail.service';
import { PasswordService } from './password.service';
import { toPublicUser } from './public-user';
import type { Environment } from '../config/environment';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionMetadata {
  ip?: string;
  userAgent?: string;
}

export interface IssuedIdentity extends UserResponse {
  accessToken: string;
  refreshToken: string;
}

class ConcurrentRefreshError extends Error {}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(IdentityTokensService)
    private readonly tokens: IdentityTokensService,
    @Inject(IdentityClockService)
    private readonly clock: IdentityClockService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async register(
    input: RegisterDto,
    metadata: SessionMetadata,
  ): Promise<IssuedIdentity> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone,
        },
      });
      return this.createSession(user, metadata);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Unable to create account');
      }
      throw error;
    }
  }

  async login(
    input: LoginDto,
    metadata: SessionMetadata,
  ): Promise<IssuedIdentity> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession(user, metadata);
  }

  async refresh(
    refreshToken: string | undefined,
    metadata: SessionMetadata,
  ): Promise<IssuedIdentity> {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = this.clock.now();
    const refreshTokenHash = this.tokens.hashRefreshToken(refreshToken);
    const current = await this.prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    });
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= now ||
      !current.user.isActive
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (current.replacedById) {
      const rotatedAt = current.lastUsedAt ?? current.createdAt;
      if (now.getTime() - rotatedAt.getTime() >= REFRESH_REUSE_GRACE_MS) {
        await this.prisma.session.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRefreshToken = this.tokens.generateOpaqueToken();
    try {
      const next = await this.prisma.$transaction(async (transaction) => {
        const successor = await transaction.session.create({
          data: {
            userId: current.userId,
            familyId: current.familyId,
            refreshTokenHash: this.tokens.hashRefreshToken(nextRefreshToken),
            userAgent: metadata.userAgent,
            ip: metadata.ip,
            expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          },
        });
        const rotation = await transaction.session.updateMany({
          where: {
            id: current.id,
            replacedById: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            replacedById: successor.id,
            lastUsedAt: now,
          },
        });
        if (rotation.count !== 1) {
          throw new ConcurrentRefreshError();
        }
        return successor;
      });

      return {
        user: toPublicUser(current.user),
        refreshToken: nextRefreshToken,
        accessToken: await this.tokens.createAccessToken({
          sub: current.user.id,
          role: current.user.role,
          sid: next.id,
        }),
      };
    } catch (error) {
      if (error instanceof ConcurrentRefreshError) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      throw error;
    }
  }

  async logout(
    refreshToken: string | undefined,
    accessToken: string | undefined,
  ): Promise<void> {
    const now = this.clock.now();
    if (refreshToken) {
      await this.prisma.session.updateMany({
        where: {
          refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }

    if (accessToken) {
      try {
        const claims = await this.tokens.verifyAccessToken(accessToken);
        await this.prisma.session.updateMany({
          where: { id: claims.sid, userId: claims.sub, revokedAt: null },
          data: { revokedAt: now },
        });
      } catch {
        // Logout is intentionally idempotent, including for stale cookies.
      }
    }
  }

  async forgotPassword(input: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user?.isActive) {
      return;
    }

    const token = this.tokens.generateOpaqueToken();
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: this.tokens.hashPasswordResetToken(token),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        },
      }),
    ]);

    const locale = input.locale ?? Locale.AR;
    const resetLink = new URL(
      `/${locale}/reset-password`,
      this.config.get('APP_URL', { infer: true }),
    );
    resetLink.searchParams.set('token', token);
    try {
      await this.mail.sendPasswordReset({
        to: user.email,
        userId: user.id,
        locale,
        resetLink: resetLink.toString(),
      });
    } catch {
      this.logger.warn(`Password reset email failed for user ${user.id}`);
    }
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    const now = this.clock.now();
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: this.tokens.hashPasswordResetToken(input.token) },
      include: { user: true },
    });
    if (
      !reset ||
      reset.usedAt ||
      reset.expiresAt <= now ||
      !reset.user.isActive
    ) {
      throw new BadRequestException('Invalid password reset request');
    }

    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.passwordReset.updateMany({
        where: {
          id: reset.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Invalid password reset request');
      }
      await transaction.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await transaction.session.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  /**
   * Deactivates the account and revokes every one of its sessions in one
   * transaction. `inTransaction` runs inside it too, for callers that must
   * commit something (an audit row) with the change.
   */
  async deactivateUser(
    id: string,
    inTransaction?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<PublicUser> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: { isActive: false },
      });
      await transaction.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await inTransaction?.(transaction);
      return toPublicUser(user);
    });
  }

  /** Lets a deactivated account sign in again (with a fresh session). */
  async reactivateUser(
    id: string,
    inTransaction?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<PublicUser> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: { isActive: true },
      });
      await inTransaction?.(transaction);
      return toPublicUser(user);
    });
  }

  private async createSession(
    user: {
      email: string;
      id: string;
      name: string;
      phone: string;
      role: 'ADMIN' | 'STUDENT';
    },
    metadata: SessionMetadata,
  ): Promise<IssuedIdentity> {
    const refreshToken = this.tokens.generateOpaqueToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
        userAgent: metadata.userAgent,
        ip: metadata.ip,
        expiresAt: new Date(this.clock.now().getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      user: toPublicUser(user),
      refreshToken,
      accessToken: await this.tokens.createAccessToken({
        sub: user.id,
        role: user.role,
        sid: session.id,
      }),
    };
  }
}
