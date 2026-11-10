import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies only the matching password', async () => {
    const passwordHash = await service.hash('correct horse battery staple');

    expect(passwordHash).toContain('$argon2id$');
    await expect(
      service.verify(passwordHash, 'correct horse battery staple'),
    ).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'wrong password')).resolves.toBe(
      false,
    );
  });

  it('performs a dummy verification without exposing its result', async () => {
    await expect(service.verifyDummy('anything')).resolves.toBeUndefined();
  });
});
