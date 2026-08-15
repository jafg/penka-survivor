/**
 * Redis databases: this module claims `/9` and `/10` for any throttled app
 * instance this API ever needs. `/1`–`/4` belong to @penka/api's auth suite,
 * `/5`–`/6` to its penkas suite and `/7`–`/8` to its game suite (there is no
 * allocator, so the claim is this comment). No admin route is throttled today —
 * this API is operator-only and not exposed to the internet — so nothing here
 * overrides the default database yet.
 *
 * Both apps under test share ONE Mongo database and ONE Redis: that is the
 * premise of the back office, and the polling-profile test below only means
 * something because of it. Each describe owns its own league, since matchdays
 * belong to a league and closing one moves it for every penka playing it.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Value } from '@sinclair/typebox/value';
import {
  AdminMatchdayDetailResponseSchema,
  AdminPoolsResponseSchema,
  CloseMatchdayResponseSchema,
  POLLING_PROFILE_KEY,
  SetResultResponseSchema,
  matchdayId,
} from '@penka/contracts';
import { buildApp } from '../../src/app';
import { matchdaysCollection, matchesCollection } from '../../src/modules/admin/store';
import { adminHeaders, makeTestConfig, startInfra, type TestInfra } from './harness';
import {
  buildPlayerApi,
  createPenka,
  joinPenka,
  nextPollInSec,
  registerUser,
  submitPick,
  type TestPenka,
} from './seed';

const DB_NAME = `penka-test-${randomUUID().slice(0, 8)}`;

let infra: TestInfra;
let admin: FastifyInstance;
let player: FastifyInstance;

beforeAll(async () => {
  infra = await startInfra();
  admin = buildApp({ config: makeTestConfig(infra, { mongoDbName: DB_NAME }) });
  player = buildPlayerApi(infra, DB_NAME);
  await Promise.all([admin.ready(), player.ready()]);
}, 180_000);

afterAll(async () => {
  await Promise.all([admin.close(), player.close()]);
  await infra.stop();
});

/** Seeds a league's calendar the only way it is ever created: a player makes a penka. */
async function seedLeague(leagueId: string, label: string): Promise<TestPenka> {
  const user = await registerUser(player, label);
  return createPenka(player, user, leagueId);
}

/** The matches of a league's matchday 1, in fixture order, straight from Mongo. */
async function matchesOf(leagueId: string, number = 1) {
  return matchesCollection(admin.db)
    .find({ matchdayId: matchdayId(leagueId, number) })
    .toArray();
}

function codeOf(response: { json: <T>() => T }): string {
  return response.json<{ code: string }>().code;
}

describe('admin authentication', () => {
  const GUARDED = [
    { method: 'GET' as const, url: '/admin/v1/penkas' },
    { method: 'GET' as const, url: '/admin/v1/leagues/copa-america/matchdays/1' },
    {
      method: 'POST' as const,
      url: '/admin/v1/matches/copa-america%3Amd1%3AARG-BRA/result',
      payload: { outcome: 'home' },
    },
    { method: 'POST' as const, url: '/admin/v1/leagues/copa-america/matchdays/1/close' },
    { method: 'POST' as const, url: '/admin/v1/leagues/copa-america/matchdays/1/resolve' },
    { method: 'PUT' as const, url: '/admin/v1/polling-profile', payload: { profile: 'slow' } },
  ];

  it.each(GUARDED)('refuses $method $url without an admin key', async (route) => {
    const response = await admin.inject(route);

    expect(response.statusCode).toBe(401);
    expect(codeOf(response)).toBe('unauthorized');
  });

  it.each(GUARDED)('refuses $method $url with the wrong admin key', async (route) => {
    const response = await admin.inject({ ...route, headers: adminHeaders('not-the-admin-key') });

    expect(response.statusCode).toBe(401);
    expect(codeOf(response)).toBe('unauthorized');
  });

  it('answers the same way to a missing key and a wrong one', async () => {
    // A caller without the key learns nothing about which mistake they made.
    const missing = await admin.inject({ method: 'GET', url: '/admin/v1/penkas' });
    const wrong = await admin.inject({
      method: 'GET',
      url: '/admin/v1/penkas',
      headers: adminHeaders('not-the-admin-key'),
    });

    expect(missing.json()).toEqual(wrong.json());
  });

  it('leaves /health open, since a load balancer has no admin key', async () => {
    const response = await admin.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('lets a request with the key through', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/penkas',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /admin/v1/penkas', () => {
  let penka: TestPenka;

  beforeAll(async () => {
    penka = await seedLeague('copa-america', 'pools-owner');
    const second = await registerUser(player, 'pools-player');
    await joinPenka(player, second, penka.joinCode);
    const [match] = await matchesOf('copa-america');
    await submitPick(player, second, penka.id, match?.homeTeamCode ?? '');
  });

  it('summarizes every penka for the operator', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/penkas',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ pools: { penka: { id: string } }[] }>();
    expect(Value.Check(AdminPoolsResponseSchema, body)).toBe(true);
    expect(body.pools.find((pool) => pool.penka.id === penka.id)).toMatchObject({
      entryCount: 2,
      aliveCount: 2,
      islandCount: 0,
      // Only the player who actually picked, and only for the matchday being
      // played — the creator joined but has not picked.
      picksReceived: 1,
      resolvedMatchdays: 0,
    });
  });
});

describe('GET /admin/v1/leagues/:leagueId/matchdays/:number', () => {
  beforeAll(async () => {
    await seedLeague('champions-league', 'detail-owner');
  });

  it('returns the matchday, its matches and the cadence players are being served', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/leagues/champions-league/matchdays/1',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      matchday: { id: string; status: string };
      matches: { id: string }[];
      pollingProfile: string;
    }>();
    expect(Value.Check(AdminMatchdayDetailResponseSchema, body)).toBe(true);
    expect(body.matchday).toMatchObject({ id: 'champions-league:md1', status: 'open' });
    expect(body.matches.length).toBeGreaterThan(0);
    // Nothing has been set, so the deployment is on the default cadence.
    expect(body.pollingProfile).toBe('normal');
  });

  it('is a 404 for a matchday number that does not exist', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/leagues/champions-league/matchdays/9',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('matchday_not_found');
  });

  it('is a 404 for a league nobody plays', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/leagues/no-such-league/matchdays/1',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('matchday_not_found');
  });

  it('rejects a matchday number that is not a number', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/leagues/champions-league/matchdays/one',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(400);
    expect(codeOf(response)).toBe('validation_failed');
  });
});

describe('POST /admin/v1/matches/:matchId/result', () => {
  let firstMatchId: string;
  let matchCount: number;

  beforeAll(async () => {
    await seedLeague('copa-libertadores', 'results-owner');
    const matches = await matchesOf('copa-libertadores');
    matchCount = matches.length;
    firstMatchId = matches[0]?._id ?? '';
  });

  it('stores the outcome and says how much of the matchday is still missing', async () => {
    // A real derived id, colons and all: `copa-libertadores:md1:RIV-ATN`. The
    // client is the one that must encodeURIComponent it into the path.
    expect(firstMatchId).toMatch(/^copa-libertadores:md1:[A-Z0-9]{2,5}-[A-Z0-9]{2,5}$/);

    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${encodeURIComponent(firstMatchId)}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'home' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ match: { id: string; outcome: string } }>();
    expect(Value.Check(SetResultResponseSchema, body)).toBe(true);
    expect(body).toMatchObject({
      match: { id: firstMatchId, outcome: 'home' },
      pendingMatches: matchCount - 1,
      // The matchday is still open for picks, so resolving it is not on offer
      // however many results are in.
      readyToResolve: false,
    });

    const stored = await matchesCollection(admin.db).findOne({ _id: firstMatchId });
    expect(stored?.outcome).toBe('home');
  });

  it('accepts the id unencoded too, since a colon is legal in a path segment', async () => {
    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${firstMatchId}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'away' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ match: { outcome: string } }>().match.outcome).toBe('away');
  });

  it('is a 404 for a well-formed id that names no fixture', async () => {
    // `RIV-BOC` is a plausible Libertadores tie and not the one the round robin
    // scheduled for matchday 1 — the colons are not what makes this a miss.
    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${encodeURIComponent('copa-libertadores:md1:RIV-BOC')}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'home' },
    });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('not_found');
  });

  it('rejects an outcome that is not home, draw or away', async () => {
    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${encodeURIComponent(firstMatchId)}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'tie' },
    });

    expect(response.statusCode).toBe(422);
    expect(codeOf(response)).toBe('invalid_outcome');
  });

  it('refuses to rewrite the results of a matchday that was already resolved', async () => {
    // Only the workers set `resolved`, so this is how that state is reached
    // here. Players were already eliminated on the old result and nothing
    // re-runs a resolved matchday.
    const penka = await seedLeague('fifa-world-cup', 'resolved-owner');
    expect(penka.id).toBeTruthy();
    const [match] = await matchesOf('fifa-world-cup');
    await matchdaysCollection(admin.db).updateOne(
      { _id: matchdayId('fifa-world-cup', 1) },
      { $set: { status: 'resolved' } },
    );

    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${encodeURIComponent(match?._id ?? '')}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'home' },
    });

    expect(response.statusCode).toBe(409);
    expect(codeOf(response)).toBe('already_resolved');
  });
});

describe('POST /admin/v1/leagues/:leagueId/matchdays/:number/close', () => {
  beforeAll(async () => {
    await seedLeague('la-liga', 'close-owner');
  });

  it('locks the matchday synchronously', async () => {
    const response = await admin.inject({
      method: 'POST',
      url: '/admin/v1/leagues/la-liga/matchdays/1/close',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ matchday: { status: string } }>();
    expect(Value.Check(CloseMatchdayResponseSchema, body)).toBe(true);
    expect(body.matchday.status).toBe('locked');

    const stored = await matchdaysCollection(admin.db).findOne({ _id: matchdayId('la-liga', 1) });
    expect(stored?.status).toBe('locked');
  });

  it('is idempotent — a double-click is the same request twice', async () => {
    const response = await admin.inject({
      method: 'POST',
      url: '/admin/v1/leagues/la-liga/matchdays/1/close',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ matchday: { status: string } }>().matchday.status).toBe('locked');
  });

  it('refuses to close a matchday that was already resolved', async () => {
    await matchdaysCollection(admin.db).updateOne(
      { _id: matchdayId('la-liga', 2) },
      { $set: { status: 'resolved' } },
    );

    const response = await admin.inject({
      method: 'POST',
      url: '/admin/v1/leagues/la-liga/matchdays/2/close',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(codeOf(response)).toBe('already_resolved');
  });

  it('is a 404 for a matchday that does not exist', async () => {
    const response = await admin.inject({
      method: 'POST',
      url: '/admin/v1/leagues/la-liga/matchdays/9/close',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('matchday_not_found');
  });
});

// Last on purpose: the profile is deployment-wide, so setting it here would
// change what the matchday-detail test above reads.
describe('PUT /admin/v1/polling-profile', () => {
  let before: TestPenka;
  let after: TestPenka;

  beforeAll(async () => {
    before = await seedLeague('premier-league', 'polling-owner');
    const second = await registerUser(player, 'polling-second');
    after = await createPenka(player, second, 'premier-league');
  });

  afterAll(async () => {
    await admin.redis.del(POLLING_PROFILE_KEY);
  });

  it('rejects a profile outside the closed set', async () => {
    const response = await admin.inject({
      method: 'PUT',
      url: '/admin/v1/polling-profile',
      headers: adminHeaders(),
      payload: { profile: 'turbo' },
    });

    expect(response.statusCode).toBe(422);
    expect(codeOf(response)).toBe('invalid_profile');
  });

  it('changes the cadence @penka/api serves, through the shared Redis key', async () => {
    // The cross-app pair, end to end: the back office writes the key and the
    // players' API reads it on its next board build. Two penkas because a board
    // is cached for 60s — the second one has never been built, so it shows the
    // new cadence rather than a remembered answer.
    expect(await nextPollInSec(player, before.id)).toBe(10);

    const response = await admin.inject({
      method: 'PUT',
      url: '/admin/v1/polling-profile',
      headers: adminHeaders(),
      payload: { profile: 'slow' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ profile: 'slow' });
    expect(await admin.redis.get(POLLING_PROFILE_KEY)).toBe('slow');
    expect(await nextPollInSec(player, after.id)).toBe(30);
  });

  it('reports the profile it is now serving on the matchday view', async () => {
    const response = await admin.inject({
      method: 'GET',
      url: '/admin/v1/leagues/premier-league/matchdays/1',
      headers: adminHeaders(),
    });

    expect(response.json<{ pollingProfile: string }>().pollingProfile).toBe('slow');
  });
});
