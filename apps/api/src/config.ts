/**
 * Environment configuration, validated at boot. `loadConfig` throws a single
 * error listing every problem so a misconfigured deploy fails fast with one
 * clear message instead of dying one variable at a time.
 *
 * Required:
 *   JWT_SECRET — at least 32 characters; secrets never get defaults.
 * Optional, defaulting to the local infra from infra/docker-compose.yml:
 *   PORT=3000, MONGO_URL=mongodb://127.0.0.1:27017, MONGO_DB=penka,
 *   REDIS_URL=redis://127.0.0.1:6379, RATE_LIMIT_MAX=10 (per minute per IP
 *   on register/login), TRUST_PROXY=false.
 * Token lifetimes are product policy, not deployment knobs: access 15m,
 * refresh 7d.
 */
export interface AppConfig {
  port: number;
  mongoUrl: string;
  mongoDbName: string;
  redisUrl: string;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  rateLimitMax: number;
  /** Fastify's trustProxy: false, true, a hop count, or a proxy IP/CIDR list. */
  trustProxy: boolean | number | string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Off by default: with no proxy in front, trusting X-Forwarded-For would let
 * any client forge its own rate-limit bucket. Behind a proxy, prefer a hop
 * count or an IP/CIDR list over a bare `true`.
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw === '' || raw === 'false') {
    return false;
  }
  if (raw === 'true') {
    return true;
  }
  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) {
    return hops;
  }
  return raw;
}

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

  const port = positiveInt('PORT', 3000);
  const rateLimitMax = positiveInt('RATE_LIMIT_MAX', 10);

  const mongoUrl = env.MONGO_URL ?? 'mongodb://127.0.0.1:27017';
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUrl)) {
    problems.push(`MONGO_URL must start with mongodb:// or mongodb+srv://, got "${mongoUrl}"`);
  }
  const mongoDbName = env.MONGO_DB ?? 'penka';

  const redisUrl = env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  if (!/^rediss?:\/\//.test(redisUrl)) {
    problems.push(`REDIS_URL must start with redis:// or rediss://, got "${redisUrl}"`);
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    problems.push('JWT_SECRET is required and must be at least 32 characters');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }

  return {
    port,
    mongoUrl,
    mongoDbName,
    redisUrl,
    jwtSecret,
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    rateLimitMax,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}
