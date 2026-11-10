import { createHash, createHmac, randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { Role, type Role as RoleValue } from '@app/shared';

import { ACCESS_TOKEN_TTL_SECONDS } from './identity.constants';
import type { Environment } from '../config/environment';

export interface AccessTokenClaims {
  role: RoleValue;
  sid: string;
  sub: string;
}

@Injectable()
export class IdentityTokensService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshPepper: string;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.accessSecret = new TextEncoder().encode(
      config.get('JWT_ACCESS_SECRET', { infer: true }),
    );
    this.refreshPepper = config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshPepper).update(token).digest('hex');
  }

  hashPasswordResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ role: claims.role, sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.accessSecret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.accessSecret, {
      algorithms: ['HS256'],
    });
    const role = payload.role;
    const sid = payload.sid;
    if (
      !payload.sub ||
      typeof sid !== 'string' ||
      (role !== Role.ADMIN && role !== Role.STUDENT)
    ) {
      throw new UnauthorizedException('Authentication required');
    }

    return { sub: payload.sub, role, sid };
  }
}
