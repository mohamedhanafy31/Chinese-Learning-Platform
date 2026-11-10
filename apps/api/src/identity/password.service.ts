import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  // @node-rs/argon2 declares Algorithm as an ambient const enum, which strict
  // isolated modules cannot reference. The library's Argon2id value is 2.
  algorithm: 2,
} as const;

@Injectable()
export class PasswordService {
  private readonly dummyHash = hash(
    'constant-time-dummy-password-value',
    ARGON2_OPTIONS,
  );

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password, ARGON2_OPTIONS);
  }

  async verifyDummy(password: string): Promise<void> {
    await verify(await this.dummyHash, password, ARGON2_OPTIONS);
  }
}
