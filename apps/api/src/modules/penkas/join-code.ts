import { randomInt } from 'node:crypto';

/**
 * 4 digits, 0000–9999, so a code can be read out loud across an office — a
 * DELIBERATE MVP ceiling, not an oversight. The trade-offs it buys:
 *   - 10,000 codes total, so a popular deployment eventually runs out of
 *     concurrent penkas and creation fails with join_code_space_exhausted;
 *   - the space is small enough to enumerate, which is why joining is rate
 *     limited per user AND per IP rather than trusting the code alone.
 * The production path is 6 alphanumeric characters (~2.2 billion codes), which
 * removes both problems and is a drop-in replacement for this generator.
 */
export const JOIN_CODE_SPACE = 10_000;

/** Give up after this many collisions and report the space as exhausted. */
export const MAX_JOIN_CODE_ATTEMPTS = 5;

export type JoinCodeGenerator = () => string;

/**
 * Cryptographically random and uniform: `randomInt` rejection-samples, so no
 * code is likelier than another (a `% 10000` over random bytes would bias the
 * low end and make guessing measurably easier).
 */
export const generateJoinCode: JoinCodeGenerator = () =>
  randomInt(JOIN_CODE_SPACE).toString().padStart(4, '0');
