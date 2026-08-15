import { describe, expect, it, vi } from 'vitest';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError, errorHandler, notFoundHandler } from './errors';

function fakeReply() {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
}

function fakeRequest() {
  return { log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyRequest;
}

describe('errorHandler', () => {
  it('answers an ApiError with its own status, code and message', () => {
    const { reply, sent } = fakeReply();

    errorHandler(
      new ApiError(409, 'matchday_not_locked', 'Close the matchday first') as FastifyError,
      fakeRequest(),
      reply,
    );

    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      status: 409,
      code: 'matchday_not_locked',
      message: 'Close the matchday first',
    });
  });

  it('turns a schema validation failure into 400 validation_failed', () => {
    const { reply, sent } = fakeReply();
    const error = new Error('body/outcome must be one of home, draw, away') as FastifyError;
    error.validation = [];

    errorHandler(error, fakeRequest(), reply);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: 'validation_failed' });
  });

  it('never leaks an unexpected failure to an operator', () => {
    // An operator seeing a Mongo connection string in a 500 body is a leak even
    // though the audience is trusted: the message goes to a browser and a log.
    const { reply, sent } = fakeReply();
    const request = fakeRequest();

    errorHandler(new Error('mongodb://user:hunter2@cluster/penka') as FastifyError, request, reply);

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      status: 500,
      code: 'internal',
      message: 'Internal server error',
    });
    expect(request.log.error).toHaveBeenCalled();
  });

  it('maps a framework 4xx to its canonical code and keeps its message', () => {
    const { reply, sent } = fakeReply();
    const error = new Error('Unexpected end of JSON input') as FastifyError;
    error.statusCode = 400;
    error.code = 'FST_ERR_CTP_INVALID_JSON_BODY';

    errorHandler(error, fakeRequest(), reply);

    expect(sent.body).toEqual({
      status: 400,
      code: 'validation_failed',
      message: 'Unexpected end of JSON input',
    });
  });

  it('gives a non-framework 4xx a generic message', () => {
    const { reply, sent } = fakeReply();
    const error = new Error('connect ECONNREFUSED 10.0.0.1:27017') as FastifyError;
    error.statusCode = 403;

    errorHandler(error, fakeRequest(), reply);

    expect(sent.body).toEqual({ status: 403, code: 'forbidden', message: 'Forbidden' });
  });
});

describe('notFoundHandler', () => {
  it('answers the canonical envelope, never Fastify default shape', () => {
    const { reply, sent } = fakeReply();

    notFoundHandler(fakeRequest(), reply);

    expect(sent.status).toBe(404);
    expect(sent.body).toEqual({ status: 404, code: 'not_found', message: 'Route not found' });
  });
});
