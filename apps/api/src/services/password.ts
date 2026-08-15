import argon2 from 'argon2';

/**
 * argon2id with the OWASP password-storage cheat-sheet minimum configuration:
 * m=19456 KiB (19 MiB), t=2 iterations, p=1 lane. argon2 generates a random
 * salt per call, so hashing the same password twice never yields the same
 * string. Password policy: minimum 8 characters, enforced by
 * RegisterRequestSchema in @penka/contracts (kept simple on purpose).
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/** Never throws: a malformed or foreign stored hash is a failed verification. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Hash of a random throwaway password (generated once, offline). Login
 * verifies against this when the email is unknown so both failure modes cost
 * one argon2 verification — the response time does not reveal whether an
 * email is registered.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$3LYF+WHEosm4X9Z9nnoM3w$BTmlFlaMO/6Fl9G38Mq1x07scNHlAhpq3PVAGpF4blE';
