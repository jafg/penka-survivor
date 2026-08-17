import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from 'mongodb';
import {
  AdminLeagueMatchdaysResponseSchema,
  AdminMatchdayDetailResponseSchema,
  AdminPoolsResponseSchema,
  CloseMatchdayResponseSchema,
  ErrorCodes,
  LeagueMatchdayParamsSchema,
  LeagueParamsSchema,
  MatchParamsSchema,
  POLLING_PROFILE_KEY,
  ResolveMatchdayResponseSchema,
  SetPollingProfileRequestSchema,
  SetPollingProfileResponseSchema,
  SetResultRequestSchema,
  SetResultResponseSchema,
  matchdayId,
  toPollingProfile,
  type ResolveMatchdayCommand,
} from '@penka/contracts';
import type { ResolveRejectionCode } from '@penka/game-engine';
import { ApiError } from '../../errors';
import { currentMatchdayIds, summarizePools } from './pools';
import { countPending, whyNotResolvable } from './preconditions';
import { claimResolveRequest, clearResolveRequest, requestResolution } from './resolve';
import {
  ensureAdminIndexes,
  entriesCollection,
  matchdaysCollection,
  matchesCollection,
  penkasCollection,
  picksCollection,
  toEntry,
  toMatch,
  toMatchday,
  toPenka,
  type MatchDoc,
  type MatchdayDoc,
} from './store';
import { assertValidBody } from './validation';

/** See the note in @penka/api's routes: a plain plugin must assert its decorators itself. */
const REQUIRED_DECORATORS = ['db', 'redis', 'publisher', 'requireAdmin'] as const;

/**
 * Why the engine would refuse to resolve, in the operator's words. All three are
 * 409: the request is well formed and the matchday exists — the competition is
 * simply not at that point yet, and the fix is another operator action, not a
 * different payload.
 */
const RESOLVE_REJECTION_MESSAGE: Record<ResolveRejectionCode, string> = {
  matchday_not_locked: 'Close this matchday before resolving it',
  results_missing: 'Some matches still have no result',
  already_resolved: 'This matchday was already resolved',
};

/** Matchdays are addressed by league and number; the document id is derived, never taken. */
async function loadMatchday(db: Db, leagueId: string, number: number): Promise<MatchdayDoc> {
  const matchday = await matchdaysCollection(db).findOne({ _id: matchdayId(leagueId, number) });
  if (matchday === null) {
    throw new ApiError(404, ErrorCodes.matchday_not_found, 'Unknown matchday');
  }
  return matchday;
}

/**
 * The matchday a match belongs to. Unlike the route above this one is reached
 * through a stored reference, so a miss is not an operator typo — it is a
 * broken calendar, and saying "not found" would send them looking for a
 * matchday number they never typed.
 */
async function loadParentMatchday(
  db: Db,
  match: MatchDoc,
  log: FastifyBaseLogger,
): Promise<MatchdayDoc> {
  const matchday = await matchdaysCollection(db).findOne({ _id: match.matchdayId });
  if (matchday === null) {
    log.error(
      { matchId: match._id, matchdayId: match.matchdayId },
      'match points at a matchday that does not exist: the calendar is inconsistent',
    );
    throw new ApiError(500, ErrorCodes.internal, 'This match belongs to no matchday');
  }
  return matchday;
}

/**
 * A materialized calendar can be half written — the matchdays landed and the
 * matches did not. @penka/api answers 500 for exactly this, and the back office
 * must not disagree: an empty fixture list would read as "nothing to load
 * results for" and hide the real failure from the one person who can fix it.
 */
async function loadMatches(db: Db, id: string, log: FastifyBaseLogger): Promise<MatchDoc[]> {
  const matches = await matchesCollection(db).find({ matchdayId: id }).toArray();
  if (matches.length === 0) {
    log.error({ matchdayId: id }, 'matchday has no matches: the calendar is incomplete');
    throw new ApiError(500, ErrorCodes.internal, 'This matchday has no fixtures yet');
  }
  return matches;
}

export const adminRoutes: FastifyPluginAsync = async (instance) => {
  for (const decorator of REQUIRED_DECORATORS) {
    if (!instance.hasDecorator(decorator)) {
      throw new Error(
        `adminRoutes requires the "${decorator}" decorator: register the mongo, redis, ` +
          'rabbit, and admin-auth plugins before it',
      );
    }
  }
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  await ensureAdminIndexes(app.db);

  app.get(
    '/penkas',
    { preHandler: app.requireAdmin, schema: { response: { 200: AdminPoolsResponseSchema } } },
    async () => {
      const penkas = (await penkasCollection(app.db).find().toArray()).map(toPenka);
      if (penkas.length === 0) {
        return { pools: [] };
      }

      const [entryDocs, matchdayDocs] = await Promise.all([
        entriesCollection(app.db)
          .find({ penkaId: { $in: penkas.map((penka) => penka.id) } })
          .toArray(),
        matchdaysCollection(app.db)
          .find({ leagueId: { $in: [...new Set(penkas.map((penka) => penka.leagueId))] } })
          .toArray(),
      ]);
      const entries = entryDocs.map(toEntry);
      const matchdays = matchdayDocs.map(toMatchday);
      // Bounded twice over: only the matchday each league is playing, and only
      // entries of the penkas being listed.
      const picks = await picksCollection(app.db)
        .find({
          matchdayId: { $in: currentMatchdayIds(matchdays) },
          entryId: { $in: entries.map((entry) => entry.id) },
        })
        .toArray();

      return { pools: summarizePools({ penkas, entries, matchdays, picks }) };
    },
  );

  app.get(
    '/leagues/:leagueId/matchdays',
    {
      preHandler: app.requireAdmin,
      schema: {
        params: LeagueParamsSchema,
        response: { 200: AdminLeagueMatchdaysResponseSchema },
      },
    },
    async (request) => {
      // Sorted here rather than in the console: the order is a property of a
      // calendar, and every client would otherwise re-sort what Mongo happened
      // to return.
      const matchdays = await matchdaysCollection(app.db)
        .find({ leagueId: request.params.leagueId })
        .sort({ number: 1 })
        .toArray();

      // No 404 for an empty result, unlike the detail route below. "Which
      // matchdays does this league have?" has a true answer for a league nobody
      // plays — none — and the console asks this before it knows whether a
      // league is in play at all.
      return { matchdays: matchdays.map(toMatchday) };
    },
  );

  app.get(
    '/leagues/:leagueId/matchdays/:number',
    {
      preHandler: app.requireAdmin,
      schema: {
        params: LeagueMatchdayParamsSchema,
        response: { 200: AdminMatchdayDetailResponseSchema },
      },
    },
    async (request) => {
      const matchday = await loadMatchday(app.db, request.params.leagueId, request.params.number);
      const [matches, profile] = await Promise.all([
        loadMatches(app.db, matchday._id, request.log),
        app.redis.get(POLLING_PROFILE_KEY),
      ]);

      return {
        matchday: toMatchday(matchday),
        matches: matches.map(toMatch),
        // The cadence players are actually being served right now, read from the
        // same key this API writes — never a remembered copy.
        pollingProfile: toPollingProfile(profile),
      };
    },
  );

  app.post(
    '/matches/:matchId/result',
    {
      preHandler: app.requireAdmin,
      // The body carries one closed enum, and the contract has a canonical code
      // for getting it wrong; see assertValidBody.
      attachValidation: true,
      schema: {
        params: MatchParamsSchema,
        body: SetResultRequestSchema,
        response: { 200: SetResultResponseSchema },
      },
    },
    async (request) => {
      assertValidBody(
        request.validationError,
        'outcome',
        ErrorCodes.invalid_outcome,
        'Outcome must be home, draw or away',
      );
      // Derived match ids carry colons (`copa-libertadores:md1:RIV-BOC`), so
      // clients must encodeURIComponent the id into the path. The route does NOT
      // decode it again: find-my-way already decoded the segment, and a second
      // decodeURIComponent would turn an id containing a literal `%` into a
      // different id (and throw on a malformed one — which routing has already
      // rejected as a 400 by the time this handler runs).
      const matchId = request.params.matchId;
      const match = await matchesCollection(app.db).findOne({ _id: matchId });
      if (match === null) {
        throw new ApiError(404, ErrorCodes.not_found, 'Unknown match');
      }

      const matchday = await loadParentMatchday(app.db, match, request.log);
      if (matchday.status === 'resolved') {
        // Beyond the letter of the endpoint, but the alternative is worse: the
        // workers have already eliminated players on the old result, and nothing
        // re-runs a resolved matchday, so the stored result would permanently
        // disagree with the standings it produced.
        throw new ApiError(
          409,
          ErrorCodes.already_resolved,
          'This matchday was already resolved; its results can no longer change',
        );
      }

      await matchesCollection(app.db).updateOne(
        { _id: match._id },
        { $set: { outcome: request.body.outcome } },
      );
      // Re-read rather than patch in memory: what the operator needs next is the
      // state of the whole matchday, and a concurrent operator may have loaded
      // another result while this one was in flight.
      const matches = await loadMatches(app.db, matchday._id, request.log);

      return {
        match: toMatch({ ...match, outcome: request.body.outcome }),
        pendingMatches: countPending(matches.map(toMatch)),
        // Exactly the question the resolve endpoint will ask, so the back office
        // can grey out its button instead of re-deriving the rule.
        readyToResolve: whyNotResolvable(toMatchday(matchday), matches.map(toMatch)) === null,
      };
    },
  );

  app.post(
    '/leagues/:leagueId/matchdays/:number/close',
    {
      preHandler: app.requireAdmin,
      schema: {
        params: LeagueMatchdayParamsSchema,
        response: { 200: CloseMatchdayResponseSchema },
      },
    },
    async (request) => {
      const matchday = await loadMatchday(app.db, request.params.leagueId, request.params.number);
      if (matchday.status === 'resolved') {
        throw new ApiError(
          409,
          ErrorCodes.already_resolved,
          'This matchday was already resolved and cannot be closed again',
        );
      }

      // Idempotent on purpose: closing an already-closed matchday is the same
      // request twice, and an operator double-click is not an error. Locking is
      // also the one thing that cannot be undone here — reopening would let a
      // player pick knowing a result.
      await matchdaysCollection(app.db).updateOne(
        { _id: matchday._id },
        { $set: { status: 'locked' } },
      );

      return { matchday: toMatchday({ ...matchday, status: 'locked' }) };
    },
  );

  app.post(
    '/leagues/:leagueId/matchdays/:number/resolve',
    {
      preHandler: app.requireAdmin,
      schema: {
        params: LeagueMatchdayParamsSchema,
        response: { 200: ResolveMatchdayResponseSchema },
      },
    },
    async (request) => {
      const { leagueId, number } = request.params;
      const matchday = await loadMatchday(app.db, leagueId, number);
      const matches = await loadMatches(app.db, matchday._id, request.log);

      // The engine decides whether resolution is possible — here on the operator's
      // screen and again in the worker, from the same function. Refusing here is
      // what keeps unrunnable work out of the queue.
      const rejection = whyNotResolvable(toMatchday(matchday), matches.map(toMatch));
      if (rejection !== null) {
        throw new ApiError(409, rejection, RESOLVE_REJECTION_MESSAGE[rejection]);
      }

      // The request is claimed BEFORE the penkas are read, and the read is
      // filtered by the same instant the workers count with — so the penkas that
      // get a command and the penkas the matchday waits for are one set, on the
      // first press and on every republish. See `claimResolveRequest`.
      const { requestedAt, claimed } = await claimResolveRequest(app.db, matchday._id, new Date());

      // Resolution fans out over the LEAGUE: every penka playing this calendar
      // resolves the same matchday, each with its own settings and entries.
      const penkas = await penkasCollection(app.db)
        .find({ leagueId, createdAt: { $lte: requestedAt } })
        .toArray();
      if (penkas.length === 0) {
        // Publishing nothing and marking the matchday requested would leave it
        // looking done forever, so say plainly that there is nobody to resolve.
        if (claimed) {
          await clearResolveRequest(app.db, request.log, matchday._id);
        }
        throw new ApiError(
          404,
          ErrorCodes.penka_not_found,
          'No penka plays this league, so there is nothing to resolve',
        );
      }

      const commands: ResolveMatchdayCommand[] = penkas.map((penka) => ({
        penkaId: penka._id.toHexString(),
        leagueId,
        matchday: number,
        requestedAt: requestedAt.toISOString(),
      }));
      await requestResolution({
        db: app.db,
        log: request.log,
        publisher: app.publisher,
        matchdayId: matchday._id,
        commands,
        claimed,
      });

      // `queued`, never `resolved`: the workers do the resolving, and the
      // matchday's status only changes when they are done.
      return { queued: true as const, matchdayId: matchday._id };
    },
  );

  app.put(
    '/polling-profile',
    {
      preHandler: app.requireAdmin,
      attachValidation: true,
      schema: {
        body: SetPollingProfileRequestSchema,
        response: { 200: SetPollingProfileResponseSchema },
      },
    },
    async (request) => {
      assertValidBody(
        request.validationError,
        'profile',
        ErrorCodes.invalid_profile,
        'Profile must be live, normal or slow',
      );

      // One key for the deployment, written here and read by @penka/api on the
      // next board request — no restart, no cache to invalidate. It has no TTL:
      // a profile an operator set stays set until another operator changes it.
      await app.redis.set(POLLING_PROFILE_KEY, request.body.profile);

      return { profile: request.body.profile };
    },
  );
};
