import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { MongoClient } from 'mongodb';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/config';
import { createTokenService } from '../../src/services/token';
import { failNextInsert, makeTestConfig, startInfra, type TestInfra } from './harness';

const PASSWORD = 'sup3r-secret';

let infra: TestInfra;
let config: AppConfig;
let app: FastifyInstance;

let emailCounter = 0;
function uniqueEmail(tag: string): string {
  emailCounter += 1;
  return `${tag}-${emailCounter}@test.penka.dev`;
}

function register(
  target: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<LightMyRequestResponse> {
  return target.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, displayName: 'Player One', password },
  });
}

function login(
  target: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<LightMyRequestResponse> {
  return target.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
}

function refresh(target: FastifyInstance, refreshToken: string): Promise<LightMyRequestResponse> {
  return target.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
}

function me(target: FastifyInstance, accessToken?: string): Promise<LightMyRequestResponse> {
  return target.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` },
  });
}

beforeAll(async () => {
  infra = await startInfra();
  config = makeTestConfig(infra);
  app = buildApp({ config });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await infra.stop();
});

describe('register → login → me', () => {
  it('walks the happy path', async () => {
    const email = uniqueEmail('happy');

    const registered = await register(app, email);
    expect(registered.statusCode).toBe(201);
    const { user, tokens } = registered.json();
    expect(user).toEqual({
      id: expect.any(String),
      email,
      displayName: 'Player One',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));

    const loggedIn = await login(app, email);
    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.json().user).toEqual(user);

    const profile = await me(app, loggedIn.json().tokens.accessToken);
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual({ user });
  });

  it('rejects a password shorter than 8 characters with validation_failed', async () => {
    const response = await register(app, uniqueEmail('shortpw'), 'seven77');

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_failed');
  });

  it('rejects unknown body fields instead of silently dropping them', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: uniqueEmail('extra'),
        displayName: 'Player One',
        password: PASSWORD,
        isAdmin: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_failed');
  });

  it('rejects a malformed JSON body as a client error, not a 500', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_failed');
  });

  it('leaves no orphaned account behind when token issuance fails', async () => {
    const email = uniqueEmail('orphan');

    const restore = failNextInsert(app.db, 'refreshTokens');
    let failed;
    try {
      failed = await register(app, email);
    } finally {
      restore();
    }
    expect(failed.statusCode).toBe(500);

    // The account must not exist half-created: registering again succeeds.
    const retry = await register(app, email);
    expect(retry.statusCode).toBe(201);
    expect((await login(app, email)).statusCode).toBe(200);
  });
});

describe('unmatched routes', () => {
  it('answers an unknown path with the canonical error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      status: 404,
      code: 'not_found',
      message: expect.any(String),
    });
  });

  it('serves the current user at /api/v1/me, the documented path', async () => {
    // Pinned because the sibling routes live under /auth: /me is the contract.
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(404);
    expect((await me(app)).statusCode).toBe(401);
  });
});

describe('duplicate email', () => {
  it('returns 409 email_taken, case-insensitively', async () => {
    const email = uniqueEmail('Dup');
    expect((await register(app, email)).statusCode).toBe(201);

    const duplicate = await register(app, email.toLowerCase());

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({
      status: 409,
      code: 'email_taken',
      message: expect.any(String),
    });
  });
});

describe('bad credentials', () => {
  it('returns a byte-identical 401 body for unknown email and wrong password', async () => {
    const email = uniqueEmail('badcred');
    await register(app, email);

    const unknownEmail = await login(app, uniqueEmail('ghost'));
    const wrongPassword = await login(app, email, 'wrong-password');

    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual({
      status: 401,
      code: 'invalid_credentials',
      message: expect.any(String),
    });
    expect(unknownEmail.body).toBe(wrongPassword.body);
  });
});

describe('refresh rotation', () => {
  it('issues a new pair and revokes the used refresh token', async () => {
    const registered = await register(app, uniqueEmail('refresh'));
    const original = registered.json().tokens;

    const refreshed = await refresh(app, original.refreshToken);
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json().tokens;
    expect(next.refreshToken).toEqual(expect.any(String));
    expect(next.refreshToken).not.toBe(original.refreshToken);

    // The new access token authenticates.
    expect((await me(app, next.accessToken)).statusCode).toBe(200);

    // The used refresh token no longer works.
    const replay = await refresh(app, original.refreshToken);
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toEqual({
      status: 401,
      code: 'unauthorized',
      message: expect.any(String),
    });

    // The rotated token is live and grants exactly one more refresh.
    expect((await refresh(app, next.refreshToken)).statusCode).toBe(200);
    expect((await refresh(app, next.refreshToken)).statusCode).toBe(401);
  });

  it('rejects a refresh token it never issued', async () => {
    const response = await refresh(app, 'made-up-refresh-token');

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('unauthorized');
  });

  it('keeps the old token usable when issuing the new pair fails', async () => {
    const registered = await register(app, uniqueEmail('rotate-fail'));
    const original = registered.json().tokens.refreshToken;

    const restore = failNextInsert(app.db, 'refreshTokens');
    let failed;
    try {
      failed = await refresh(app, original);
    } finally {
      restore();
    }
    expect(failed.statusCode).toBe(500);

    // A transient write failure must not consume the token: the client can retry.
    const retry = await refresh(app, original);
    expect(retry.statusCode).toBe(200);
    expect((await me(app, retry.json().tokens.accessToken)).statusCode).toBe(200);
  });

  it('lets exactly one of two concurrent refreshes win', async () => {
    const registered = await register(app, uniqueEmail('rotate-race'));
    const original = registered.json().tokens.refreshToken;

    const results = await Promise.all([refresh(app, original), refresh(app, original)]);

    const statuses = results.map((response) => response.statusCode).sort();
    expect(statuses).toEqual([200, 401]);

    const winner = results.find((response) => response.statusCode === 200);
    if (winner === undefined) throw new Error('expected one refresh to succeed');
    expect((await me(app, winner.json().tokens.accessToken)).statusCode).toBe(200);
    // The loser must not leave a usable token behind.
    expect((await refresh(app, original)).statusCode).toBe(401);
  });
});

describe('protected routes', () => {
  it('rejects a request without a token', async () => {
    const response = await me(app);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      status: 401,
      code: 'unauthorized',
      message: expect.any(String),
    });
  });

  it('rejects a malformed bearer token', async () => {
    const response = await me(app, 'not-a-jwt');

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('unauthorized');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forger = createTokenService({ secret: 'f'.repeat(32), accessTtlSeconds: 900 });
    const forged = await forger.signAccessToken('000000000000000000000000');

    const response = await me(app, forged);

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('unauthorized');
  });

  it('rejects a non-bearer authorization scheme', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('unauthorized');
  });
});

describe('rate limiting', () => {
  it('throttles login with 429 rate_limited after the configured burst', async () => {
    const hammer = buildApp({
      config: makeTestConfig(infra, { rateLimitMax: 3, redisUrl: `${infra.redisUrl}/1` }),
    });
    try {
      await hammer.ready();
      for (let i = 0; i < 3; i += 1) {
        // Wrong credentials, but under the limit: still a 401, never a 429.
        expect((await login(hammer, 'nobody@test.penka.dev')).statusCode).toBe(401);
      }

      const throttled = await login(hammer, 'nobody@test.penka.dev');

      expect(throttled.statusCode).toBe(429);
      expect(throttled.json()).toEqual({
        status: 429,
        code: 'rate_limited',
        message: expect.any(String),
      });
    } finally {
      await hammer.close();
    }
  });

  it('throttles register with 429 rate_limited after the configured burst', async () => {
    const hammer = buildApp({
      config: makeTestConfig(infra, { rateLimitMax: 3, redisUrl: `${infra.redisUrl}/2` }),
    });
    try {
      await hammer.ready();
      for (let i = 0; i < 3; i += 1) {
        expect((await register(hammer, uniqueEmail('burst'))).statusCode).toBe(201);
      }

      const throttled = await register(hammer, uniqueEmail('burst'));

      expect(throttled.statusCode).toBe(429);
      expect(throttled.json().code).toBe('rate_limited');
    } finally {
      await hammer.close();
    }
  });

  it('buckets per forwarded client IP when trustProxy is configured', async () => {
    const hammer = buildApp({
      config: makeTestConfig(infra, {
        rateLimitMax: 2,
        redisUrl: `${infra.redisUrl}/3`,
        trustProxy: true,
      }),
    });
    const attempt = (clientIp: string) =>
      hammer.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-forwarded-for': clientIp },
        payload: { email: 'nobody@test.penka.dev', password: PASSWORD },
      });
    try {
      await hammer.ready();
      expect((await attempt('203.0.113.7')).statusCode).toBe(401);
      expect((await attempt('203.0.113.7')).statusCode).toBe(401);
      expect((await attempt('203.0.113.7')).statusCode).toBe(429);

      // A different client behind the same proxy keeps its own budget.
      expect((await attempt('203.0.113.8')).statusCode).toBe(401);
    } finally {
      await hammer.close();
    }
  });

  it('ignores forwarded IP headers when trustProxy is off', async () => {
    const hammer = buildApp({
      config: makeTestConfig(infra, { rateLimitMax: 2, redisUrl: `${infra.redisUrl}/4` }),
    });
    const attempt = (clientIp: string) =>
      hammer.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-forwarded-for': clientIp },
        payload: { email: 'nobody@test.penka.dev', password: PASSWORD },
      });
    try {
      await hammer.ready();
      expect((await attempt('203.0.113.7')).statusCode).toBe(401);
      expect((await attempt('203.0.113.8')).statusCode).toBe(401);

      // Spoofed headers must not buy a fresh budget: same socket, same bucket.
      expect((await attempt('203.0.113.9')).statusCode).toBe(429);
    } finally {
      await hammer.close();
    }
  });
});

describe('credential material never leaks', () => {
  it('keeps password and refresh-token hashes out of every response body', async () => {
    const email = uniqueEmail('leak');
    const registered = await register(app, email);
    const loggedIn = await login(app, email);
    const refreshed = await refresh(app, loggedIn.json().tokens.refreshToken);
    const profile = await me(app, refreshed.json().tokens.accessToken);
    expect(refreshed.statusCode).toBe(200);
    expect(profile.statusCode).toBe(200);

    const issuedRefreshTokens: string[] = [
      registered.json().tokens.refreshToken,
      loggedIn.json().tokens.refreshToken,
      refreshed.json().tokens.refreshToken,
    ];

    const client = new MongoClient(infra.mongoUrl);
    try {
      await client.connect();
      const db = client.db(config.mongoDbName);

      const userDoc = await db.collection('users').findOne({ email });
      if (userDoc === null) throw new Error('user was not persisted');
      const passwordHash = String(userDoc.passwordHash);
      expect(passwordHash).toMatch(/^\$argon2id\$/);

      const storedTokens = await db
        .collection('refreshTokens')
        .find({ userId: String(userDoc._id) })
        .toArray();
      // register + refresh output are live; login's token was rotated away.
      const tokenService = createTokenService({ secret: config.jwtSecret, accessTtlSeconds: 900 });
      const storedHashes = storedTokens.map((doc) => String(doc.tokenHash)).sort();
      expect(storedHashes).toEqual(
        [
          tokenService.hashRefreshToken(issuedRefreshTokens[0] ?? ''),
          tokenService.hashRefreshToken(issuedRefreshTokens[2] ?? ''),
        ].sort(),
      );
      // Stored hashed, not raw: no issued token ever appears in Mongo.
      for (const raw of issuedRefreshTokens) {
        expect(storedHashes).not.toContain(raw);
      }

      for (const body of [registered.body, loggedIn.body, refreshed.body, profile.body]) {
        expect(body).not.toContain('passwordHash');
        expect(body).not.toContain('tokenHash');
        expect(body).not.toContain('$argon2');
        expect(body).not.toContain(passwordHash);
        for (const hash of storedHashes) {
          expect(body).not.toContain(hash);
        }
      }
    } finally {
      await client.close();
    }
  });
});
