import { Role, type PublicUser, type RegisterRequest } from '@app/shared';

import type { PasswordService } from './password.service';
import { toPublicUser } from './public-user';

interface AdminUserRecord extends PublicUser {
  passwordHash: string;
}

export interface AdminUserStore {
  user: {
    create(args: {
      data: Omit<RegisterRequest, 'password'> & {
        passwordHash: string;
        role: typeof Role.ADMIN;
      };
    }): Promise<AdminUserRecord>;
    findUnique(args: {
      where: { email: string };
    }): Promise<AdminUserRecord | null>;
    update(args: {
      data: { role: typeof Role.ADMIN };
      where: { id: string };
    }): Promise<AdminUserRecord>;
  };
}

export type AdminCreateResult =
  | { status: 'created'; user: PublicUser }
  | { status: 'promoted'; user: PublicUser }
  | { status: 'already-admin'; user: PublicUser }
  | { status: 'cancelled'; user: PublicUser };

export async function createOrPromoteAdmin(
  store: AdminUserStore,
  passwords: Pick<PasswordService, 'hash'>,
  input: RegisterRequest,
  confirmPromotion: (user: PublicUser) => Promise<boolean>,
): Promise<AdminCreateResult> {
  const existing = await store.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    const publicUser = toPublicUser(existing);
    if (existing.role === Role.ADMIN) {
      return { status: 'already-admin', user: publicUser };
    }
    if (!(await confirmPromotion(publicUser))) {
      return { status: 'cancelled', user: publicUser };
    }
    const promoted = await store.user.update({
      where: { id: existing.id },
      data: { role: Role.ADMIN },
    });
    return { status: 'promoted', user: toPublicUser(promoted) };
  }

  const passwordHash = await passwords.hash(input.password);
  const created = await store.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash,
      role: Role.ADMIN,
    },
  });
  return { status: 'created', user: toPublicUser(created) };
}
