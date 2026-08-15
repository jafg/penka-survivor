import type { Collection, Db, WithId } from 'mongodb';
import type { User } from '@penka/contracts';

/** Mongo document shapes — internal to the API; they never cross a contract boundary. */
export interface UserDoc {
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
}

export interface RefreshTokenDoc {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export function usersCollection(db: Db): Collection<UserDoc> {
  return db.collection<UserDoc>('users');
}

export function refreshTokensCollection(db: Db): Collection<RefreshTokenDoc> {
  return db.collection<RefreshTokenDoc>('refreshTokens');
}

export async function ensureAuthIndexes(db: Db): Promise<void> {
  await Promise.all([
    usersCollection(db).createIndex({ email: 1 }, { unique: true }),
    refreshTokensCollection(db).createIndex({ tokenHash: 1 }, { unique: true }),
    // Mongo's TTL sweeper garbage-collects expired refresh tokens; expiry is
    // still enforced at read time because the sweeper only runs every ~60s.
    refreshTokensCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

/** Strip credential material and normalize to the public contract shape. */
export function toPublicUser(doc: WithId<UserDoc>): User {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    displayName: doc.displayName,
    createdAt: doc.createdAt.toISOString(),
  };
}
