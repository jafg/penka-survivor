import { describe, expect, it } from 'vitest';
import { createTokenService, type TokenServiceOptions } from './token';

const SECRET = 's'.repeat(32);

function service(overrides: Partial<TokenServiceOptions> = {}) {
  return createTokenService({ secret: SECRET, accessTtlSeconds: 900, ...overrides });
}

describe('access tokens', () => {
  it('verifies a token it signed and returns the user id', async () => {
    const tokens = service();

    const token = await tokens.signAccessToken('user-42');

    await expect(tokens.verifyAccessToken(token)).resolves.toEqual({ userId: 'user-42' });
  });

  it('rejects an expired token', async () => {
    const tokens = service({ accessTtlSeconds: -10 });

    const token = await tokens.signAccessToken('user-42');

    await expect(service().verifyAccessToken(token)).resolves.toBeNull();
  });

  it('rejects a tampered token', async () => {
    const tokens = service();
    const token = await tokens.signAccessToken('user-42');
    const [header = '', payload = '', signature = ''] = token.split('.');
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const forgedPayload = Buffer.from(decoded.replace('user-42', 'user-43'), 'utf8').toString(
      'base64url',
    );
    const tampered = [header, forgedPayload, signature].join('.');
    expect(tampered).not.toBe(token);

    await expect(tokens.verifyAccessToken(tampered)).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const forger = service({ secret: 'x'.repeat(32) });

    const token = await forger.signAccessToken('user-42');

    await expect(service().verifyAccessToken(token)).resolves.toBeNull();
  });

  it('rejects a string that is not a JWT at all', async () => {
    await expect(service().verifyAccessToken('not-a-jwt')).resolves.toBeNull();
  });
});

describe('refresh tokens', () => {
  it('generates unique, url-safe opaque tokens', () => {
    const tokens = service();

    const first = tokens.generateRefreshToken();
    const second = tokens.generateRefreshToken();

    expect(first).not.toBe(second);
    // 32 random bytes → 43 base64url characters, no padding.
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes refresh tokens deterministically to something that is not the token', () => {
    const tokens = service();
    const token = tokens.generateRefreshToken();

    const hash = tokens.hashRefreshToken(token);

    expect(hash).toBe(tokens.hashRefreshToken(token));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
    expect(tokens.hashRefreshToken('some-other-token')).not.toBe(hash);
  });
});
