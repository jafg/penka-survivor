import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { POLLING_PROFILE_KEY } from '@penka/contracts';
import { env } from './env';

/**
 * Every collection the game writes. Listed rather than discovered so a new
 * collection has to be added here deliberately — a reset that silently misses
 * one leaves the suite reading yesterday's state.
 */
const COLLECTIONS = [
  'users',
  'refreshTokens',
  'penkas',
  'entries',
  'matchdays',
  'matches',
  'picks',
  'resolutions',
] as const;

/**
 * Redis keys the suite must not inherit from a previous run:
 * cached boards, the deployment-wide polling profile, and the rate-limit
 * counters that would otherwise make a second run inside the same minute trip
 * the 10/min limit on register.
 */
const REDIS_PATTERNS = ['penka:*:board', POLLING_PROFILE_KEY, 'fastify-rate-limit-*'] as const;

/**
 * Empty the game data, deterministically, WITHOUT dropping the database.
 *
 * Dropping would also drop the indexes the apps create at boot — the unique
 * ones on `penkas.joinCode`, `entries (penkaId,userId)`, `matchdays
 * (leagueId,number)`, `picks (entryId,matchdayId)` and `resolutions
 * (penkaId,matchdayId)`. Those indexes ARE the join-code collision check, the
 * idempotent join and the once-only resolution, so a suite that dropped them
 * would be testing a system with its guarantees switched off, against apps that
 * only re-create them on restart.
 *
 * The wipe is also what makes the matchday clock usable: lock times are
 * relative to the moment a league is first materialized (MD1 at +120 min), so a
 * fresh calendar is the only way the pick step reliably finds an OPEN matchday.
 */
export async function resetGameData(): Promise<void> {
  const mongo = new MongoClient(env.mongoUrl);
  try {
    await mongo.connect();
    const db = mongo.db(env.mongoDb);
    for (const name of COLLECTIONS) {
      await db.collection(name).deleteMany({});
    }
  } finally {
    await mongo.close();
  }

  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 2 });
  try {
    for (const pattern of REDIS_PATTERNS) {
      const keys = pattern.includes('*') ? await redis.keys(pattern) : [pattern];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } finally {
    redis.disconnect();
  }
}
