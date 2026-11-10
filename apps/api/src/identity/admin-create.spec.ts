import { jest } from '@jest/globals';
import { Role, type PublicUser, type RegisterRequest } from '@app/shared';

import { createOrPromoteAdmin, type AdminUserStore } from './admin-create';

const input: RegisterRequest = {
  email: 'admin@example.com',
  name: 'Admin User',
  password: 'safe-password',
  phone: '+201001234567',
};

function record(role: 'ADMIN' | 'STUDENT') {
  return {
    id: '48c76d33-559b-4936-b131-fb45f04891f1',
    email: input.email,
    name: input.name,
    phone: input.phone,
    passwordHash: 'stored-hash',
    role,
  };
}

describe('createOrPromoteAdmin', () => {
  it('creates a new administrator with a password hash', async () => {
    const create = jest
      .fn<AdminUserStore['user']['create']>()
      .mockResolvedValue(record(Role.ADMIN));
    const store = {
      user: {
        findUnique: jest
          .fn<AdminUserStore['user']['findUnique']>()
          .mockResolvedValue(null),
        create,
        update: jest.fn<AdminUserStore['user']['update']>(),
      },
    } satisfies AdminUserStore;
    const result = await createOrPromoteAdmin(
      store,
      {
        hash: jest
          .fn<(password: string) => Promise<string>>()
          .mockResolvedValue('stored-hash'),
      },
      input,
      jest.fn<(user: PublicUser) => Promise<boolean>>(),
    );

    expect(result.status).toBe('created');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: input.email,
        passwordHash: 'stored-hash',
        role: Role.ADMIN,
      }),
    });
  });

  it('promotes an existing student only after confirmation', async () => {
    const update = jest
      .fn<AdminUserStore['user']['update']>()
      .mockResolvedValue(record(Role.ADMIN));
    const store = {
      user: {
        findUnique: jest
          .fn<AdminUserStore['user']['findUnique']>()
          .mockResolvedValue(record(Role.STUDENT)),
        create: jest.fn<AdminUserStore['user']['create']>(),
        update,
      },
    } satisfies AdminUserStore;
    const result = await createOrPromoteAdmin(
      store,
      { hash: jest.fn<(password: string) => Promise<string>>() },
      input,
      jest.fn<(user: PublicUser) => Promise<boolean>>().mockResolvedValue(true),
    );

    expect(result.status).toBe('promoted');
    expect(update).toHaveBeenCalledWith({
      where: { id: record(Role.STUDENT).id },
      data: { role: Role.ADMIN },
    });
  });

  it('leaves an existing student unchanged when promotion is declined', async () => {
    const update = jest.fn<AdminUserStore['user']['update']>();
    const store = {
      user: {
        findUnique: jest
          .fn<AdminUserStore['user']['findUnique']>()
          .mockResolvedValue(record(Role.STUDENT)),
        create: jest.fn<AdminUserStore['user']['create']>(),
        update,
      },
    } satisfies AdminUserStore;
    const result = await createOrPromoteAdmin(
      store,
      { hash: jest.fn<(password: string) => Promise<string>>() },
      input,
      jest
        .fn<(user: PublicUser) => Promise<boolean>>()
        .mockResolvedValue(false),
    );

    expect(result.status).toBe('cancelled');
    expect(update).not.toHaveBeenCalled();
  });
});
