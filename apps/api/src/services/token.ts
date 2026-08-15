import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export interface TokenServiceOptions {
  secret: string;
  accessTtlSeconds: number;
}

export interface TokenService {
  signAccessToken(userId: string): Promise<string>;
  verifyAccessToken(token: string): Promise<{ userId: string } | null>;
  generateRefreshToken(): string;
  hashRefreshToken(token: string): string;
}

/**
 * Access tokens are HS256 JWTs carrying the user id as `sub` (TTL from
 * config: 15 minutes). Refresh tokens are opaque 256-bit random strings; the
 * API stores only their SHA-256 hash, so a database leak reveals no usable
 * refresh token. `verifyAccessToken` never throws — any invalid, tampered, or
 * expired token is `null`.
 */
export function createTokenService(options: TokenServiceOptions): TokenService {
  const key = new TextEncoder().encode(options.secret);

  return {
    async signAccessToken(userId) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuedAt(nowSeconds)
        .setExpirationTime(nowSeconds + options.accessTtlSeconds)
        .sign(key);
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          return null;
        }
        return { userId: payload.sub };
      } catch {
        return null;
      }
    },

    generateRefreshToken() {
      return randomBytes(32).toString('base64url');
    },

    hashRefreshToken(token) {
      return createHash('sha256').update(token).digest('hex');
    },
  };
}
