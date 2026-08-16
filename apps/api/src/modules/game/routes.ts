import type { FastifyBaseLogger, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ObjectId, type Db, type WithId } from 'mongodb';
import { Value } from '@sinclair/typebox/value';
import {
  BOARD_CACHE_TTL_SECONDS,
  BoardResponseSchema,
  BoardSchema,
  CurrentMatchdayResponseSchema,
  MyEntryResponseSchema,
  POLLING_PROFILE_KEY,
  PenkaParamsSchema,
  SubmitPickRequestSchema,
  SubmitPickResponseSchema,
  boardCacheKey,
  nextPollInSec,
  toPollingProfile,
  type Board,
  type MyEntry,
} from '@penka/contracts';
import {
  buildBoard,
  selectCurrentMatchday,
  validatePick,
  type PickRejectionCode,
} from '@penka/game-engine';
import { ApiError } from '../../errors';
import { isDuplicateKeyError } from '../../lib/mongo-errors';
import { usersCollection } from '../auth/store';
import {
  entriesCollection,
  matchdaysCollection,
  matchesCollection,
  penkasCollection,
  toEntry,
  type EntryDoc,
  type MatchDoc,
  type MatchdayDoc,
  type PenkaDoc,
} from '../penkas/store';
import {
  ensureGameIndexes,
  picksCollection,
  resolutionsCollection,
  toMatch,
  toMatchday,
  toPlayerPick,
  toResolution,
} from './store';

/** See the note in authRoutes: a plain plugin must assert its decorators itself. */
const REQUIRED_DECORATORS = ['db', 'redis', 'authenticate'] as const;

/** Status per engine rejection. The engine names the reason; the API only picks the code. */
const PICK_REJECTION_STATUS: Record<PickRejectionCode, number> = {
  // Nothing about the request is wrong — it simply came too late, or from a
  // player this penka has already knocked out. That is a conflict, not a 422.
  matchday_locked: 409,
  on_island: 409,
  team_not_playing: 422,
  team_already_used: 422,
  // Only reachable if a stored timestamp cannot be parsed: the engine reports
  // it instead of throwing, and refusing the pick beats guessing at the clock.
  validation_failed: 422,
};

const PICK_REJECTION_MESSAGE: Record<PickRejectionCode, string> = {
  matchday_locked: 'This matchday is already locked',
  on_island: 'Eliminated players cannot pick in this penka',
  team_not_playing: 'That team is not playing this matchday',
  team_already_used: 'You already used that team',
  validation_failed: 'Could not validate the pick',
};

/** The token subject is a user id; anything else means a forged or stale token. */
function requireUserId(request: FastifyRequest): string {
  const userId = request.userId;
  if (userId === undefined || !ObjectId.isValid(userId)) {
    throw new ApiError(401, 'unauthorized', 'Invalid access token subject');
  }
  return userId;
}

/** An unparsable id is a miss, not a 500 — it names no penka either way. */
async function loadPenka(db: Db, penkaId: string): Promise<WithId<PenkaDoc>> {
  const penka = ObjectId.isValid(penkaId)
    ? await penkasCollection(db).findOne({ _id: new ObjectId(penkaId) })
    : null;
  if (penka === null) {
    throw new ApiError(404, 'penka_not_found', 'Unknown penka');
  }
  return penka;
}

/**
 * The caller's own entry. A penka the caller has not joined answers exactly
 * like one that does not exist: membership is not something a stranger gets to
 * probe for.
 */
async function loadMyEntry(
  db: Db,
  penka: WithId<PenkaDoc>,
  userId: string,
): Promise<WithId<EntryDoc>> {
  const entry = await entriesCollection(db).findOne({
    penkaId: penka._id.toHexString(),
    userId,
  });
  if (entry === null) {
    throw new ApiError(404, 'penka_not_found', 'Unknown penka');
  }
  return entry;
}

/**
 * Matchdays are keyed by league and carry no penkaId: every penka on a league
 * plays the same calendar, so the penka is only ever a way to find the league.
 *
 * The whole calendar comes back, not only the current matchday: the board needs
 * every matchday's number to caption the history rows a resolution points at by
 * id, and that is the same query.
 */
async function loadCalendar(db: Db, leagueId: string): Promise<MatchdayDoc[]> {
  return matchdaysCollection(db).find({ leagueId }).toArray();
}

/** The lowest-numbered unresolved matchday, or the last one — the engine's rule. */
function currentMatchdayOf(matchdays: readonly MatchdayDoc[]): MatchdayDoc {
  const current = selectCurrentMatchday(matchdays);
  if (current === undefined) {
    throw new ApiError(404, 'matchday_not_found', 'This league has no calendar yet');
  }
  return current;
}

async function loadCurrentMatchday(db: Db, leagueId: string): Promise<MatchdayDoc> {
  return currentMatchdayOf(await loadCalendar(db, leagueId));
}

/**
 * A materialized calendar can be half written — the matchdays landed and the
 * matches did not. Answering with an empty fixture list would show up as "no
 * hay partidos", a lie the player cannot act on, so say the calendar is broken
 * and leave a trace an operator can find.
 */
async function loadMatches(
  db: Db,
  matchday: MatchdayDoc,
  log: FastifyBaseLogger,
): Promise<WithId<MatchDoc>[]> {
  const matches = await matchesCollection(db).find({ matchdayId: matchday._id }).toArray();
  if (matches.length === 0) {
    log.error({ matchdayId: matchday._id }, 'matchday has no matches: the calendar is incomplete');
    throw new ApiError(500, 'internal', 'This matchday has no fixtures yet');
  }
  return matches;
}

/** Display names for the board. Never widen this projection — it is a user document. */
async function loadDisplayNames(
  db: Db,
  entries: readonly WithId<EntryDoc>[],
): Promise<Map<string, string>> {
  const userIds = entries.flatMap((entry) =>
    ObjectId.isValid(entry.userId) ? [new ObjectId(entry.userId)] : [],
  );
  if (userIds.length === 0) {
    return new Map();
  }
  const users = await usersCollection(db)
    .find({ _id: { $in: userIds } }, { projection: { displayName: 1 } })
    .toArray();
  return new Map(users.map((user) => [user._id.toHexString(), user.displayName]));
}

/**
 * Record the pick, or replace the one already there — a player may change their
 * mind until lock. The unique (entryId, matchdayId) index is the arbiter of two
 * submissions in flight: the loser's upsert fails on the key, and by then the
 * row exists, so it becomes a plain update.
 */
async function upsertPick(
  db: Db,
  entryId: string,
  matchdayId: string,
  teamCode: string,
): Promise<void> {
  const filter = { entryId, matchdayId };
  // createdAt tracks THIS pick, not the first one: after a change of mind, the
  // stored timestamp is when the team that will be resolved was chosen.
  const update = { $set: { teamCode, createdAt: new Date() } };
  try {
    await picksCollection(db).updateOne(filter, update, { upsert: true });
    return;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }
  await picksCollection(db).updateOne(filter, update);
}

function toMyEntry(entry: WithId<EntryDoc>, myPick: string | null): MyEntry {
  return {
    lives: entry.lives,
    status: entry.status,
    myPick,
    usedTeams: entry.usedTeams,
  };
}

/**
 * A poisoned cache entry must not take the board down for everyone.
 *
 * Unreadable is not the only way an entry goes bad: a deploy that changes
 * `BoardSchema` leaves perfectly valid JSON of the previous shape behind, alive
 * for the rest of its TTL. That one is worse than garbage, because the response
 * serializer is compiled from the schema and throws on a missing required
 * property — every viewer of the penka would get a 500, and the poll interval
 * brings them back well inside the minute. So the shape is checked too, and a
 * stale entry is treated exactly like a miss: dropped and rebuilt.
 */
function parseCachedBoard(raw: string): Board | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return Value.Check(BoardSchema, parsed) ? parsed : null;
}

export const gameRoutes: FastifyPluginAsync = async (instance) => {
  for (const decorator of REQUIRED_DECORATORS) {
    if (!instance.hasDecorator(decorator)) {
      throw new Error(
        `gameRoutes requires the "${decorator}" decorator: register the mongo, redis, ` +
          'and auth plugins before it',
      );
    }
  }
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  await ensureGameIndexes(app.db);

  app.get(
    '/penkas/:penkaId/board',
    // Public on purpose: the board carries nothing private to a viewer, so a
    // link to it works for anyone the penka is shared with.
    { schema: { params: PenkaParamsSchema, response: { 200: BoardResponseSchema } } },
    async (request) => {
      const cacheKey = boardCacheKey(request.params.penkaId);
      const cached = await app.redis.get(cacheKey);
      if (cached !== null) {
        const board = parseCachedBoard(cached);
        if (board !== null) {
          return { board };
        }
        request.log.warn({ cacheKey }, 'discarding a cached board that is unreadable or stale');
      }

      const penka = await loadPenka(app.db, request.params.penkaId);
      const penkaId = penka._id.toHexString();
      const matchdays = await loadCalendar(app.db, penka.leagueId);
      const matchday = currentMatchdayOf(matchdays);
      const entries = await entriesCollection(app.db).find({ penkaId }).toArray();
      const [displayNames, picks, resolutions] = await Promise.all([
        loadDisplayNames(app.db, entries),
        // Fetched whether or not the matchday is locked: the builder is the one
        // place that decides what a viewer may see, so it decides here too.
        picksCollection(app.db)
          .find({
            matchdayId: matchday._id,
            entryId: { $in: entries.map((entry) => entry._id.toHexString()) },
          })
          .toArray(),
        // Written by @penka/workers, never here. Served by the prefix of the
        // unique (penkaId, matchdayId) index the worker owns; before the first
        // resolution the collection is empty, so the scan costs nothing.
        resolutionsCollection(app.db).find({ penkaId }).toArray(),
      ]);

      const now = new Date();
      const board = buildBoard({
        matchday: toMatchday(matchday),
        entries: entries.map(toEntry),
        displayNames,
        picks: picks.map(toPlayerPick),
        resolutions: resolutions.map(toResolution),
        matchdayNumbers: new Map(matchdays.map((each) => [each._id, each.number])),
        now,
        nextPollInSec: nextPollInSec({
          profile: toPollingProfile(await app.redis.get(POLLING_PROFILE_KEY)),
          now,
          lockAt: matchday.lockAt,
        }),
      });
      await app.redis.set(cacheKey, JSON.stringify(board), 'EX', BOARD_CACHE_TTL_SECONDS);
      return { board };
    },
  );

  app.get(
    '/penkas/:penkaId/me',
    {
      preHandler: app.authenticate,
      schema: { params: PenkaParamsSchema, response: { 200: MyEntryResponseSchema } },
    },
    async (request) => {
      const userId = requireUserId(request);
      const penka = await loadPenka(app.db, request.params.penkaId);
      const entry = await loadMyEntry(app.db, penka, userId);
      const matchday = await loadCurrentMatchday(app.db, penka.leagueId);
      const pick = await picksCollection(app.db).findOne({
        entryId: entry._id.toHexString(),
        matchdayId: matchday._id,
      });
      return { myEntry: toMyEntry(entry, pick?.teamCode ?? null) };
    },
  );

  app.get(
    '/penkas/:penkaId/matchday/current',
    // The calendar is the same public data the catalog serves, one matchday deep.
    { schema: { params: PenkaParamsSchema, response: { 200: CurrentMatchdayResponseSchema } } },
    async (request) => {
      const penka = await loadPenka(app.db, request.params.penkaId);
      const matchday = await loadCurrentMatchday(app.db, penka.leagueId);
      const matches = await loadMatches(app.db, matchday, request.log);
      return { matchday: toMatchday(matchday), matches: matches.map(toMatch) };
    },
  );

  app.post(
    '/penkas/:penkaId/picks',
    {
      preHandler: app.authenticate,
      schema: {
        params: PenkaParamsSchema,
        body: SubmitPickRequestSchema,
        response: { 200: SubmitPickResponseSchema },
      },
    },
    async (request) => {
      const userId = requireUserId(request);
      const penka = await loadPenka(app.db, request.params.penkaId);
      const entry = await loadMyEntry(app.db, penka, userId);
      const matchday = await loadCurrentMatchday(app.db, penka.leagueId);
      const matches = await loadMatches(app.db, matchday, request.log);

      // Every rule about whether this pick is allowed lives in the engine; the
      // API only translates its answer into a status code.
      const validation = validatePick({
        entry: toEntry(entry),
        matchday: toMatchday(matchday),
        matches: matches.map(toMatch),
        teamCode: request.body.teamCode,
        now: new Date().toISOString(),
        settings: penka.settings,
      });
      if (!validation.ok) {
        throw new ApiError(
          PICK_REJECTION_STATUS[validation.code],
          validation.code,
          PICK_REJECTION_MESSAGE[validation.code],
        );
      }

      await upsertPick(app.db, entry._id.toHexString(), matchday._id, request.body.teamCode);
      // The public board does not change here — it hides picks until lock — so
      // there is nothing to invalidate. The personal delta is the whole answer.
      return { myEntry: toMyEntry(entry, request.body.teamCode) };
    },
  );
};
