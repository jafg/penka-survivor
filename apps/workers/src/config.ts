/**
 * Environment configuration, validated at boot. `loadConfig` throws a single
 * error listing every problem so a misconfigured deploy fails fast with one
 * clear message instead of dying one variable at a time (same contract as the
 * two APIs' loaders).
 *
 * Optional, defaulting to the local infra from infra/docker-compose.yml:
 *   MONGO_URL=mongodb://127.0.0.1:27017, MONGO_DB=penka,
 *   REDIS_URL=redis://127.0.0.1:6379, RABBITMQ_URL=amqp://127.0.0.1:5672,
 *   PREFETCH=1, MAX_ATTEMPTS=3, LOG_LEVEL=info.
 *
 * Nothing here is required, and there is no secret: this process authenticates
 * nobody and answers nobody. There is also no PORT — a worker that listened on
 * one would be an API.
 */
export interface AppConfig {
  mongoUrl: string;
  mongoDbName: string;
  redisUrl: string;
  rabbitUrl: string;
  /**
   * Unacked messages this consumer will hold at once. **1 for the MVP**: it
   * makes the queue serial, so two commands for the same penka can never be in
   * flight together and the idempotency gate is never racing itself. The scale
   * path is not a bigger number on one queue — it is a consistent-hash exchange
   * keyed on penkaId, or one queue per shard, so ordering survives the fan-out.
   */
  prefetch: number;
  /** Deliveries a message gets before it is dead-lettered. See `messaging/consumer.ts`. */
  maxAttempts: number;
  logLevel: string;
}

const DEFAULTS = {
  mongoUrl: 'mongodb://127.0.0.1:27017',
  mongoDbName: 'penka',
  redisUrl: 'redis://127.0.0.1:6379',
  rabbitUrl: 'amqp://127.0.0.1:5672',
  prefetch: 1,
  maxAttempts: 3,
  logLevel: 'info',
} as const;

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const problems: string[] = [];

  /** An empty variable is unset: that is what an unfilled compose default looks like. */
  function raw(name: string): string | undefined {
    const value = env[name];
    return value === undefined || value === '' ? undefined : value;
  }

  function positiveInt(name: string, fallback: number): number {
    const value = raw(name);
    if (value === undefined) {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      problems.push(`${name} must be a positive integer, got "${value}"`);
      return fallback;
    }
    return parsed;
  }

  function url(name: string, fallback: string, pattern: RegExp, expected: string): string {
    const value = raw(name) ?? fallback;
    if (!pattern.test(value)) {
      problems.push(`${name} must start with ${expected}, got "${value}"`);
    }
    return value;
  }

  const config: AppConfig = {
    mongoUrl: url('MONGO_URL', DEFAULTS.mongoUrl, /^mongodb(\+srv)?:\/\//, 'mongodb:// or mongodb+srv://'),
    mongoDbName: raw('MONGO_DB') ?? DEFAULTS.mongoDbName,
    redisUrl: url('REDIS_URL', DEFAULTS.redisUrl, /^rediss?:\/\//, 'redis:// or rediss://'),
    rabbitUrl: url('RABBITMQ_URL', DEFAULTS.rabbitUrl, /^amqps?:\/\//, 'amqp:// or amqps://'),
    prefetch: positiveInt('PREFETCH', DEFAULTS.prefetch),
    maxAttempts: positiveInt('MAX_ATTEMPTS', DEFAULTS.maxAttempts),
    logLevel: raw('LOG_LEVEL') ?? DEFAULTS.logLevel,
  };

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return config;
}
