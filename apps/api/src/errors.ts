import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCodes, type ApiError as ApiErrorBody, type ErrorCode } from '@penka/contracts';

/**
 * Throwable canonical error: the global handler turns it into the ApiError
 * envelope from @penka/contracts. `code` is restricted to the canonical set.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function envelope(status: number, code: ErrorCode, message: string): ApiErrorBody {
  return { status, code, message };
}

/** Canonical code and safe fallback message per client-error status. */
const CLIENT_ERRORS: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: ErrorCodes.validation_failed, message: 'Bad request' },
  401: { code: ErrorCodes.unauthorized, message: 'Unauthorized' },
  403: { code: ErrorCodes.forbidden, message: 'Forbidden' },
  404: { code: ErrorCodes.not_found, message: 'Not found' },
  413: { code: ErrorCodes.validation_failed, message: 'Payload too large' },
  415: { code: ErrorCodes.validation_failed, message: 'Unsupported media type' },
  429: { code: ErrorCodes.rate_limited, message: 'Too many requests' },
};

const FALLBACK_CLIENT_ERROR = { code: ErrorCodes.validation_failed, message: 'Bad request' };

/**
 * Global error handler:
 * - ApiError → its own status, code, and message.
 * - Request-schema validation failure → 400 validation_failed (the message is
 *   schema-derived, safe to expose).
 * - Any other 4xx (malformed JSON, body too large, unsupported media type…) →
 *   that status with the matching canonical code. Fastify's own FST_ERR_*
 *   errors describe the client's mistake, so their message is passed through;
 *   a 4xx from anywhere else gets a generic message, since a library error can
 *   embed connection strings or other internals.
 * - Anything else → 500 internal with a generic message, logged server-side.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ApiError) {
    void reply.status(error.status).send(envelope(error.status, error.code, error.message));
    return;
  }
  if (error.validation !== undefined) {
    void reply.status(400).send(envelope(400, ErrorCodes.validation_failed, error.message));
    return;
  }

  const status = error.statusCode;
  if (status !== undefined && status >= 400 && status < 500) {
    const fallback = CLIENT_ERRORS[status] ?? FALLBACK_CLIENT_ERROR;
    const isFrameworkError = typeof error.code === 'string' && error.code.startsWith('FST_ERR_');
    request.log.warn(error);
    void reply
      .status(status)
      .send(envelope(status, fallback.code, isFrameworkError ? error.message : fallback.message));
    return;
  }

  request.log.error(error);
  void reply.status(500).send(envelope(500, ErrorCodes.internal, 'Internal server error'));
}

/** Unmatched path or method: the canonical envelope, never Fastify's default shape. */
export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply): void {
  void reply.status(404).send(envelope(404, ErrorCodes.not_found, 'Route not found'));
}
