import type { ErrorCode } from '@penka/contracts';
import { ApiError } from '../../errors';

/** What Fastify attaches to `request.validationError` (typed `any` upstream). */
export type RequestValidationError = Error & { validation: unknown; validationContext: string };

/** The part of an AJV error this module reads. */
interface ValidationIssue {
  instancePath?: unknown;
  params?: { missingProperty?: unknown };
}

function issues(error: RequestValidationError): ValidationIssue[] {
  return Array.isArray(error.validation) ? (error.validation as ValidationIssue[]) : [];
}

/** Is this failure about the named top-level property — wrong value or absent? */
function isAbout(error: RequestValidationError, field: string): boolean {
  return issues(error).some(
    (issue) => issue.instancePath === `/${field}` || issue.params?.missingProperty === field,
  );
}

/**
 * Answer a bad body value with the canonical code the contract has for it.
 *
 * Fastify validates the body BEFORE any handler or preHandler runs, so by
 * default a nonsense `outcome` or `profile` would already be a 400
 * validation_failed — and `invalid_outcome`/`invalid_profile` would be codes no
 * response ever carries. The routes that own those two values therefore set
 * `attachValidation` and call this first.
 *
 * The alternative was loosening the body schema to a plain string and checking
 * by hand, which would give up the closed shape @penka/contracts guarantees for
 * the sake of a status code. Only a failure about THIS field is remapped;
 * anything else (an unknown extra property, a bad path param) is rethrown
 * untouched and keeps the generic 400.
 */
export function assertValidBody(
  error: RequestValidationError | undefined,
  field: string,
  code: ErrorCode,
  message: string,
): void {
  if (error === undefined) {
    return;
  }
  if (error.validationContext === 'body' && isAbout(error, field)) {
    throw new ApiError(422, code, message);
  }
  throw error;
}
