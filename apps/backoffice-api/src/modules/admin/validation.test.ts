import { describe, expect, it } from 'vitest';
import { ApiError } from '../../errors';
import { assertValidBody, type RequestValidationError } from './validation';

/** The shape Fastify attaches to the request when attachValidation is on. */
function validationError(
  context: string,
  ...issues: { instancePath: string; params?: Record<string, unknown> }[]
): RequestValidationError {
  return Object.assign(new Error('body/outcome must be equal to one of the allowed values'), {
    validation: issues,
    validationContext: context,
  });
}

describe('assertValidBody', () => {
  it('does nothing when the request validated', () => {
    expect(() => assertValidBody(undefined, 'outcome', 'invalid_outcome', 'nope')).not.toThrow();
  });

  it('answers with the canonical code when the named field is wrong', () => {
    // The contract has a code for exactly this mistake, and a 400
    // validation_failed would hide it behind the generic one.
    const error = validationError('body', { instancePath: '/outcome' });

    try {
      assertValidBody(error, 'outcome', 'invalid_outcome', 'Unknown outcome');
      expect.unreachable('should have thrown');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(ApiError);
      expect(thrown as ApiError).toMatchObject({
        status: 422,
        code: 'invalid_outcome',
        message: 'Unknown outcome',
      });
    }
  });

  it('treats a missing field as an invalid one', () => {
    // A body with no outcome at all is the same operator mistake as a body with
    // a nonsense one, and answering both the same way keeps the client simple.
    const error = validationError('body', {
      instancePath: '',
      params: { missingProperty: 'outcome' },
    });

    expect(() => assertValidBody(error, 'outcome', 'invalid_outcome', 'Unknown outcome')).toThrow(
      ApiError,
    );
  });

  it('rethrows a body failure that is about something else', () => {
    // An unknown extra property is not an invalid outcome; calling it one would
    // send the operator looking at the wrong field.
    const error = validationError('body', {
      instancePath: '',
      params: { additionalProperty: 'x' },
    });

    expect(() => assertValidBody(error, 'outcome', 'invalid_outcome', 'Unknown outcome')).toThrow(
      error,
    );
  });

  it('rethrows a failure that did not come from the body', () => {
    // Params and querystring keep the generic 400: the canonical codes here name
    // a bad VALUE the operator sent, not a malformed path.
    const error = validationError('params', { instancePath: '/number' });

    expect(() => assertValidBody(error, 'outcome', 'invalid_outcome', 'Unknown outcome')).toThrow(
      error,
    );
  });

  it('survives a validation payload it cannot read', () => {
    // `validation` is `any` in Fastify's types and only AJV fills it in. If a
    // custom validator ever put something else there, the request is still
    // invalid — it just falls back to the generic 400 instead of guessing.
    const error = Object.assign(new Error('nope'), {
      validation: 'not an array',
      validationContext: 'body',
    });

    expect(() => assertValidBody(error, 'outcome', 'invalid_outcome', 'Unknown outcome')).toThrow(
      error,
    );
  });
});
