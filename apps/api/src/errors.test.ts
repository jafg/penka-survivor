import Fastify, { type FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import { ApiError, errorHandler, notFoundHandler } from './errors';

interface StatusCodeError extends Error {
  statusCode?: number;
  code?: string;
}

function statusCodeError(message: string, statusCode: number, code?: string): StatusCodeError {
  const error: StatusCodeError = new Error(message);
  error.statusCode = statusCode;
  if (code !== undefined) {
    error.code = code;
  }
  return error;
}

function buildBareApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  app.get('/api-error', async () => {
    throw new ApiError(409, 'email_taken', 'Email is already registered');
  });
  app.get('/unexpected', async () => {
    throw new Error('connection refused at mongodb://user:hunter2@internal-host');
  });
  app.get('/framework-error', async () => {
    throw statusCodeError('Body is not valid JSON', 400, 'FST_ERR_CTP_INVALID_JSON_BODY');
  });
  app.get('/framework-401', async () => {
    throw statusCodeError('No credentials', 401, 'FST_ERR_SOMETHING');
  });
  app.get('/framework-403', async () => {
    throw statusCodeError('Not allowed', 403, 'FST_ERR_SOMETHING');
  });
  app.get('/framework-429', async () => {
    throw statusCodeError('Slow down', 429, 'FST_ERR_SOMETHING');
  });
  app.get('/library-4xx', async () => {
    throw statusCodeError('mongodb://user:hunter2@internal-host rejected the write', 400);
  });
  app.get('/upstream-5xx', async () => {
    throw statusCodeError('upstream at internal-host is down', 503, 'FST_ERR_SOMETHING');
  });
  app.post(
    '/validated',
    {
      schema: {
        body: Type.Object({ name: Type.String({ minLength: 8 }) }, { additionalProperties: false }),
      },
    },
    async () => ({ ok: true }),
  );

  return app;
}

describe('ApiError', () => {
  it('carries status, canonical code, and message', () => {
    const error = new ApiError(403, 'forbidden', 'Nope');

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.code).toBe('forbidden');
    expect(error.message).toBe('Nope');
  });
});

describe('errorHandler', () => {
  it('maps a thrown ApiError to its status and the canonical envelope', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'GET', url: '/api-error' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: 409,
      code: 'email_taken',
      message: 'Email is already registered',
    });
    await app.close();
  });

  it('maps request-schema validation failures to 400 validation_failed', async () => {
    const app = buildBareApp();

    const response = await app.inject({
      method: 'POST',
      url: '/validated',
      payload: { name: 'short' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.status).toBe(400);
    expect(body.code).toBe('validation_failed');
    expect(body.message).toEqual(expect.any(String));
    await app.close();
  });

  it('maps unknown errors to a 500 internal that leaks nothing', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'GET', url: '/unexpected' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      status: 500,
      code: 'internal',
      message: 'Internal server error',
    });
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('internal-host');
    await app.close();
  });

  it('keeps a framework 4xx as a client error instead of reporting it as 500', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'GET', url: '/framework-error' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      status: 400,
      code: 'validation_failed',
      message: 'Body is not valid JSON',
    });
    await app.close();
  });

  it('maps a malformed JSON body to 400 validation_failed', async () => {
    const app = buildBareApp();

    const response = await app.inject({
      method: 'POST',
      url: '/validated',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_failed');
    await app.close();
  });

  it('maps framework 401/403/429 to their canonical codes', async () => {
    const app = buildBareApp();

    const unauthorized = await app.inject({ method: 'GET', url: '/framework-401' });
    const forbidden = await app.inject({ method: 'GET', url: '/framework-403' });
    const limited = await app.inject({ method: 'GET', url: '/framework-429' });

    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().code).toBe('unauthorized');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('forbidden');
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('rate_limited');
    await app.close();
  });

  it('keeps the status but hides the message of a non-framework 4xx error', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'GET', url: '/library-4xx' });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_failed');
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('internal-host');
    await app.close();
  });

  it('collapses any 5xx status to a generic 500 internal', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'GET', url: '/upstream-5xx' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      status: 500,
      code: 'internal',
      message: 'Internal server error',
    });
    expect(response.body).not.toContain('internal-host');
    await app.close();
  });
});

describe('notFoundHandler', () => {
  it('answers an unmatched route with the canonical envelope', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      status: 404,
      code: 'not_found',
      message: expect.any(String),
    });
    await app.close();
  });

  it('answers an unmatched method on a known path the same way', async () => {
    const app = buildBareApp();

    const response = await app.inject({ method: 'DELETE', url: '/api-error' });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('not_found');
    await app.close();
  });
});
