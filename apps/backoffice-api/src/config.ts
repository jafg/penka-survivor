/**
 * Environment configuration, validated at boot. `loadConfig` throws a single
 * error listing every problem so a misconfigured deploy fails fast with one
 * clear message instead of dying one variable at a time (same contract as
 * @penka/api's loader).
 *
 * Required:
 *   ADMIN_API_KEY — at least 32 characters; secrets never get defaults.
 * Optional, defaulting to the local infra from infra/docker-compose.yml:
 *   PORT=3001, MONGO_URL=mongodb://127.0.0.1:27017, MONGO_DB=penka,
 *   REDIS_URL=redis://127.0.0.1:6379, RABBITMQ_URL=amqp://127.0.0.1:5672.
 *
 * There is no RATE_LIMIT_MAX or TRUST_PROXY here: this API is operator-only and
 * is not exposed to the public internet, so it has no per-IP budgets to key.
 */
export interface AppConfig {
  port: number;
  mongoUrl: string;
  mongoDbName: string;
  redisUrl: string;
  rabbitUrl: string;
  adminApiKey: string;
}

/**
 * A shared secret is the whole authentication story for the MVP (see
 * plugins/admin-auth), so its length is the whole strength of it: 32 characters
 * of random is out of brute-force reach, and "admin" is not.
 */
const MIN_ADMIN_KEY_LENGTH = 32;

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const problems: string[] = [];

  function positiveInt(name: string, fallback: number): number {
    const raw = env[name];
    if (raw === undefined || raw === '') {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      problems.push(`${name} must be a positive integer, got "${raw}"`);
      return fallback;
    }
    return value;
  }

  const port = positiveInt('PORT', 3001);

  const mongoUrl = env.MONGO_URL ?? 'mongodb://127.0.0.1:27017';
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUrl)) {
    problems.push(`MONGO_URL must start with mongodb:// or mongodb+srv://, got "${mongoUrl}"`);
  }
  const mongoDbName = env.MONGO_DB ?? 'penka';

  const redisUrl = env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  if (!/^rediss?:\/\//.test(redisUrl)) {
    problems.push(`REDIS_URL must start with redis:// or rediss://, got "${redisUrl}"`);
  }

  const rabbitUrl = env.RABBITMQ_URL ?? 'amqp://127.0.0.1:5672';
  if (!/^amqps?:\/\//.test(rabbitUrl)) {
    problems.push(`RABBITMQ_URL must start with amqp:// or amqps://, got "${rabbitUrl}"`);
  }

  const adminApiKey = env.ADMIN_API_KEY ?? '';
  if (adminApiKey.length < MIN_ADMIN_KEY_LENGTH) {
    problems.push(
      `ADMIN_API_KEY is required and must be at least ${MIN_ADMIN_KEY_LENGTH} characters`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }

  return { port, mongoUrl, mongoDbName, redisUrl, rabbitUrl, adminApiKey };
}
