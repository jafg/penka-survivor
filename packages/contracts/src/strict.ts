import { Type, type ObjectOptions, type TProperties } from '@sinclair/typebox';

/**
 * All contract objects are closed: unknown fields are rejected, so payloads can
 * never smuggle extra data past validation (additionalProperties: false).
 */
export function StrictObject<T extends TProperties>(properties: T, options?: ObjectOptions) {
  // additionalProperties last: caller options must never be able to reopen the schema.
  return Type.Object(properties, { ...options, additionalProperties: false });
}
