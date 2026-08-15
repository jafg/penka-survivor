import { describe, expect, it } from 'vitest';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';

describe('password service', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword(hash, 'incorrect horse')).resolves.toBe(false);
  });

  it('hashes the same password to a different string every time (per-password salt)', async () => {
    const first = await hashPassword('same-password-123');
    const second = await hashPassword('same-password-123');

    expect(first).not.toBe(second);
    // Both verify — the difference is the embedded random salt, not the password.
    await expect(verifyPassword(first, 'same-password-123')).resolves.toBe(true);
    await expect(verifyPassword(second, 'same-password-123')).resolves.toBe(true);
  });

  it('encodes argon2id with the documented OWASP parameters', async () => {
    const hash = await hashPassword('parameters-check');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).toContain('m=19456,t=2,p=1');
  });

  it('treats a malformed stored hash as a failed verification, not a crash', async () => {
    await expect(verifyPassword('not-a-hash', 'whatever')).resolves.toBe(false);
  });

  it('ships a dummy argon2id hash that never verifies (login timing equalizer)', async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(DUMMY_PASSWORD_HASH, 'anything')).resolves.toBe(false);
  });
});
