import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ObjectId, type Db, type WithId } from 'mongodb';
import {
  CreatePenkaRequestSchema,
  CreatePenkaResponseSchema,
  DEFAULT_PENKA_SETTINGS,
  JoinPenkaRequestSchema,
  JoinPenkaResponseSchema,
  MyPenkasResponseSchema,
} from '@penka/contracts';
import type { AppConfig } from '../../config';
import { ApiError } from '../../errors';
import { findLeague } from '../catalog/catalog';
import { MAX_JOIN_CODE_ATTEMPTS, generateJoinCode, type JoinCodeGenerator } from './join-code';
import { ensureLeagueMaterialized } from './materialize';
import { isDuplicateKeyError } from './mongo-errors';
import { discardPenka } from './rollback';
import {
  ensurePenkaIndexes,
  entriesCollection,
  penkasCollection,
  toEntry,
  toPenka,
  type EntryDoc,
  type PenkaDoc,
} from './store';

export interface PenkaRoutesOptions {
  config: AppConfig;
  /** Injectable so tests can force join-code collisions; defaults to the real one. */
  generateJoinCode?: JoinCodeGenerator;
}

/** See the note in authRoutes: a plain plugin must assert its decorators itself. */
const REQUIRED_DECORATORS = ['db', 'authenticate', 'createRateLimit'] as const;

/** One budget's per-request check, as returned by app.createRateLimit(). */
type RateLimitCheck = ReturnType<FastifyInstance['createRateLimit']>;

/**
 * A settled rejection carries an unknown reason. ApiError and every driver
 * error are Errors, so they are rethrown untouched — status code and all.
 */
function toThrowable(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/** The token subject is a user id; anything else means a forged or stale token. */
function requireUserId(request: FastifyRequest): string {
  const userId = request.userId;
  if (userId === undefined || !ObjectId.isValid(userId)) {
    throw new ApiError(401, 'unauthorized', 'Invalid access token subject');
  }
  return userId;
}

/**
 * Insert the penka under a fresh join code, retrying when the code is taken.
 * The unique index is the arbiter — checking "is this code free?" first would
 * lose the race between the check and the insert.
 */
async function insertWithJoinCode(
  db: Db,
  penka: Omit<PenkaDoc, 'joinCode'>,
  nextJoinCode: JoinCodeGenerator,
): Promise<WithId<PenkaDoc>> {
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const doc: PenkaDoc = { ...penka, joinCode: nextJoinCode() };
    try {
      const { insertedId } = await penkasCollection(db).insertOne(doc);
      return { _id: insertedId, ...doc };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
  // Five collisions in a row means the 10,000-code space is essentially full
  // (see join-code.ts). Failing loudly beats handing out a code twice.
  throw new ApiError(
    503,
    'join_code_space_exhausted',
    'Could not allocate a join code, please try again',
  );
}

/**
 * Add the user to the penka, or hand back the entry they already have —
 * joining twice is the same as joining once. `$setOnInsert` plus the unique
 * (penkaId, userId) index means a double-click cannot cost a player their
 * progress by resetting lives.
 */
async function ensureEntry(db: Db, doc: EntryDoc): Promise<WithId<EntryDoc>> {
  const filter = { penkaId: doc.penkaId, userId: doc.userId };
  try {
    const entry = await entriesCollection(db).findOneAndUpdate(
      filter,
      { $setOnInsert: doc },
      { upsert: true, returnDocument: 'after' },
    );
    if (entry !== null) {
      return entry;
    }
  } catch (error) {
    // Two joins in flight: the unique index rejected the loser's upsert, and
    // the winner's entry is the one to return.
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }
  const existing = await entriesCollection(db).findOne(filter);
  if (existing === null) {
    throw new ApiError(500, 'internal', 'Could not record the entry');
  }
  return existing;
}

export const penkaRoutes: FastifyPluginAsync<PenkaRoutesOptions> = async (instance, options) => {
  const { config } = options;
  const nextJoinCode = options.generateJoinCode ?? generateJoinCode;
  for (const decorator of REQUIRED_DECORATORS) {
    if (!instance.hasDecorator(decorator)) {
      throw new Error(
        `penkaRoutes requires the "${decorator}" decorator: register the mongo, redis, ` +
          'rate-limit, and auth plugins before it',
      );
    }
  }
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  await ensurePenkaIndexes(app.db);

  // Joining is the one guessable endpoint — 10,000 codes is small enough to
  // walk — so it carries two independent budgets: one per host and one per
  // account, so neither rotating IPs nor rotating logins buys extra attempts.
  //
  // These are createRateLimit checks rather than app.rateLimit() hooks on
  // purpose: a rateLimit() hook marks the request as limited and every later
  // one on the same route returns without counting, so the second budget would
  // silently never apply. Counting by hand also keeps the two Redis counters
  // apart — limiters built off the decorator carry no route information, so
  // their keys would collide without these prefixes.
  const perMinute = { max: config.rateLimitMax, timeWindow: '1 minute' } as const;
  const countByIp = app.createRateLimit({
    ...perMinute,
    keyGenerator: (request) => `join:ip:${request.ip}`,
  });
  const countByUser = app.createRateLimit({
    ...perMinute,
    // Runs after authenticate, so userId is set; the fallback is unreachable.
    keyGenerator: (request) => `join:user:${request.userId ?? request.ip}`,
  });

  async function enforce(
    check: RateLimitCheck,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await check(request);
    if (result.isAllowed || !result.isExceeded) {
      return;
    }
    void reply.header('retry-after', result.ttlInSeconds);
    throw new ApiError(
      429,
      'rate_limited',
      `Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`,
    );
  }

  const limitByIp = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await enforce(countByIp, request, reply);
  };
  const limitByUser = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await enforce(countByUser, request, reply);
  };

  app.post(
    '/penkas',
    {
      preHandler: app.authenticate,
      schema: { body: CreatePenkaRequestSchema, response: { 201: CreatePenkaResponseSchema } },
    },
    async (request, reply) => {
      const userId = requireUserId(request);
      const league = findLeague(request.body.leagueId);
      if (league === undefined) {
        throw new ApiError(404, 'league_not_found', 'Unknown league');
      }
      // The schema fills these in, but the request type keeps them optional —
      // apply the same documented defaults rather than trusting AJV to have run.
      const settings = {
        lives: request.body.settings.lives ?? DEFAULT_PENKA_SETTINGS.lives,
        islandEnabled: request.body.settings.islandEnabled ?? DEFAULT_PENKA_SETTINGS.islandEnabled,
      };

      // The calendar is shared by every penka on this league (so it usually
      // already exists) and touches different collections than the insert —
      // neither waits on the other. allSettled rather than all: if the calendar
      // fails after the penka landed, the handle is needed to roll it back.
      const [materialized, created] = await Promise.allSettled([
        ensureLeagueMaterialized(app.db, league, new Date()),
        insertWithJoinCode(
          app.db,
          {
            name: request.body.name,
            leagueId: league.league.id,
            settings,
            createdBy: userId,
            createdAt: new Date(),
          },
          nextJoinCode,
        ),
      ]);
      if (created.status === 'rejected') {
        // Nothing was stored, whatever the calendar did — it is idempotent and
        // the next creator on this league picks up where it stopped.
        throw toThrowable(created.reason);
      }
      const penka = created.value;
      if (materialized.status === 'rejected') {
        await discardPenka(app.db, request.log, penka._id);
        throw toThrowable(materialized.reason);
      }

      try {
        await ensureEntry(app.db, {
          penkaId: penka._id.toHexString(),
          userId,
          lives: settings.lives,
          status: 'alive',
          usedTeams: [],
          points: 0,
          createdAt: new Date(),
        });
      } catch (error) {
        // A penka with no players would sit on a join code nobody can use.
        await discardPenka(app.db, request.log, penka._id);
        throw error;
      }

      return reply.code(201).send({ penka: toPenka(penka) });
    },
  );

  app.post(
    '/penkas/join',
    {
      preHandler: [limitByIp, app.authenticate, limitByUser],
      schema: { body: JoinPenkaRequestSchema, response: { 200: JoinPenkaResponseSchema } },
    },
    async (request) => {
      const userId = requireUserId(request);
      const penka = await penkasCollection(app.db).findOne({ joinCode: request.body.joinCode });
      if (penka === null) {
        // Same answer for a malformed code as for one that simply does not
        // exist: a guesser learns nothing from the difference.
        throw new ApiError(404, 'invalid_join_code', 'Unknown join code');
      }
      const entry = await ensureEntry(app.db, {
        penkaId: penka._id.toHexString(),
        userId,
        lives: penka.settings.lives,
        status: 'alive',
        usedTeams: [],
        points: 0,
        createdAt: new Date(),
      });
      return { penka: toPenka(penka), entry: toEntry(entry) };
    },
  );

  app.get(
    '/me/penkas',
    { preHandler: app.authenticate, schema: { response: { 200: MyPenkasResponseSchema } } },
    async (request) => {
      const userId = requireUserId(request);
      // Entries first: they are what makes a penka mine, and they carry the
      // status summary. Most recently joined first — _id breaks ties within a
      // millisecond, since ObjectIds increase with time.
      const entries = await entriesCollection(app.db)
        .find({ userId })
        .sort({ createdAt: -1, _id: -1 })
        .toArray();
      if (entries.length === 0) {
        return { penkas: [] };
      }

      // An unparsable penkaId would throw and cost this player their whole
      // list, so a row that cannot name a penka is dropped like a missing one.
      const penkaIds = entries.flatMap((entry) =>
        ObjectId.isValid(entry.penkaId) ? [new ObjectId(entry.penkaId)] : [],
      );
      const penkas = await penkasCollection(app.db)
        .find({ _id: { $in: penkaIds } })
        .toArray();
      const byId = new Map(penkas.map((penka) => [penka._id.toHexString(), penka]));

      return {
        penkas: entries.flatMap((entry) => {
          const penka = byId.get(entry.penkaId);
          // A missing penka means an orphaned entry: skip it rather than 500.
          return penka === undefined ? [] : [{ penka: toPenka(penka), entry: toEntry(entry) }];
        }),
      };
    },
  );
};
