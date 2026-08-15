/**
 * Redis databases: this module claims `/7` and `/8` for throttled app instances.
 * `/1`–`/4` belong to auth.int.test.ts and `/5`–`/6` to penkas.int.test.ts (there
 * is no allocator, so the claim is this comment). No game route is throttled
 * today, so nothing here overrides the default database yet.
 *
 * Matchdays belong to a LEAGUE, not to a penka, so every test that moves a lock
 * time or deletes fixtures moves it for every penka on that league. Each describe
 * below therefore owns its league, and the three that mutate the calendar
 * (`champions-league`, `la-liga`, `fifa-world-cup`) are not shared with any other.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Value } from '@sinclair/typebox/value';
import {
  BoardResponseSchema,
  CurrentMatchdayResponseSchema,
  MyEntryResponseSchema,
  SubmitPickResponseSchema,
} from '@penka/contracts';
import { buildApp } from '../../src/app';
import { picksCollection } from '../../src/modules/game/store';
import { matchdayId } from '../../src/modules/penkas/calendar';
import {
  entriesCollection,
  matchdaysCollection,
  matchesCollection,
} from '../../src/modules/penkas/store';
import { makeTestConfig, startInfra, type TestInfra } from './harness';

const PASSWORD = 'penka-password-1';
const UNKNOWN_PENKA_ID = '6a80b60ffda322125df55e5f';

interface TestUser {
  token: string;
  userId: string;
  displayName: string;
}

async function registerUser(app: FastifyInstance, label: string): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `${label}-${randomUUID().slice(0, 8)}@test.penka.dev`,
      displayName: label,
      password: PASSWORD,
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json<{ user: { id: string }; tokens: { accessToken: string } }>();
  return { token: body.tokens.accessToken, userId: body.user.id, displayName: label };
}

function bearer(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.token}` };
}

async function createPenka(
  app: FastifyInstance,
  user: TestUser,
  leagueId: string,
  settings: { lives?: number; islandEnabled?: boolean } = {},
): Promise<{ id: string; joinCode: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/penkas',
    headers: bearer(user),
    payload: { name: `Penka ${leagueId}`, leagueId, settings },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ penka: { id: string; joinCode: string } }>().penka;
}

async function joinPenka(app: FastifyInstance, user: TestUser, joinCode: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/penkas/join',
    headers: bearer(user),
    payload: { joinCode },
  });
  expect(response.statusCode).toBe(200);
}

function getBoard(app: FastifyInstance, penkaId: string) {
  return app.inject({ method: 'GET', url: `/api/v1/penkas/${penkaId}/board` });
}

function getMyEntry(app: FastifyInstance, user: TestUser, penkaId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/penkas/${penkaId}/me`,
    headers: bearer(user),
  });
}

function getCurrentMatchday(app: FastifyInstance, penkaId: string) {
  return app.inject({ method: 'GET', url: `/api/v1/penkas/${penkaId}/matchday/current` });
}

function submitPick(app: FastifyInstance, user: TestUser, penkaId: string, teamCode: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/penkas/${penkaId}/picks`,
    headers: bearer(user),
    payload: { teamCode },
  });
}

interface BoardPlayerBody {
  displayName: string;
  lives: number;
  points: number;
  pick: string | null;
}

interface BoardBody {
  matchday: number;
  lockAt: string;
  isLocked: boolean;
  isResolved: boolean;
  alive: BoardPlayerBody[];
  island: BoardPlayerBody[];
  history: unknown[];
  nextPollInSec: number;
}

function boardOf(response: { json: <T>() => T }): BoardBody {
  return response.json<{ board: BoardBody }>().board;
}

/** Both tables at once: what a viewer sees, wherever the standings put a player. */
function everyPlayer(board: BoardBody): BoardPlayerBody[] {
  return [...board.alive, ...board.island];
}

function myPickOf(response: { json: <T>() => T }): string | null {
  return response.json<{ myEntry: { myPick: string | null } }>().myEntry.myPick;
}

function codeOf(response: { json: <T>() => T }): string {
  return response.json<{ code: string }>().code;
}

describe('game endpoints', () => {
  let infra: TestInfra;
  let app: FastifyInstance;

  beforeAll(async () => {
    infra = await startInfra();
    app = buildApp({ config: makeTestConfig(infra) });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await infra.stop();
  });

  /** The teams playing a league's matchday 1, in fixture order. */
  async function playingTeams(leagueId: string): Promise<string[]> {
    const matches = await matchesCollection(app.db)
      .find({ matchdayId: matchdayId(leagueId, 1) })
      .toArray();
    return matches.flatMap((match) => [match.homeTeamCode, match.awayTeamCode]);
  }

  /** One team playing matchday 1; distinct indexes give distinct teams. */
  async function playingTeam(leagueId: string, index = 0): Promise<string> {
    const team = (await playingTeams(leagueId))[index];
    if (team === undefined) {
      throw new Error(`${leagueId} matchday 1 has no team at position ${index}`);
    }
    return team;
  }

  /** Move matchday 1's lock into the past, the way the clock would. */
  async function lockFirstMatchday(leagueId: string): Promise<void> {
    const result = await matchdaysCollection(app.db).updateOne(
      { _id: matchdayId(leagueId, 1) },
      { $set: { lockAt: new Date(Date.now() - 60_000) } },
    );
    expect(result.matchedCount).toBe(1);
  }

  async function entryIdOf(penkaId: string, user: TestUser): Promise<string> {
    const entry = await entriesCollection(app.db).findOne({ penkaId, userId: user.userId });
    if (entry === null) {
      throw new Error(`${user.displayName} has no entry in ${penkaId}`);
    }
    return entry._id.toHexString();
  }

  describe('GET /api/v1/penkas/:penkaId/board — before lock', () => {
    const LEAGUE = 'copa-libertadores';

    it('serves any viewer without a token, and reveals no pick anyone has made', async () => {
      const ana = await registerUser(app, 'ana');
      const beto = await registerUser(app, 'beto');
      const penka = await createPenka(app, ana, LEAGUE);
      await joinPenka(app, beto, penka.joinCode);
      const anaTeam = await playingTeam(LEAGUE, 0);
      const betoTeam = await playingTeam(LEAGUE, 2);
      expect((await submitPick(app, ana, penka.id, anaTeam)).statusCode).toBe(200);
      expect((await submitPick(app, beto, penka.id, betoTeam)).statusCode).toBe(200);

      // No authorization header anywhere: the board is public.
      const response = await getBoard(app, penka.id);

      expect(response.statusCode).toBe(200);
      expect(Value.Check(BoardResponseSchema, response.json())).toBe(true);
      const board = boardOf(response);
      expect(board.isLocked).toBe(false);
      expect(everyPlayer(board)).toHaveLength(2);
      expect(everyPlayer(board).map((player) => player.pick)).toEqual([null, null]);
      // Deeply, on the bytes that actually go out: nothing about a pick, and
      // nothing that belongs to one viewer rather than to all of them.
      expect(response.body).not.toContain(anaTeam);
      expect(response.body).not.toContain(betoTeam);
      expect(response.body).not.toContain('usedTeams');
      expect(response.body).not.toContain('myPick');
      expect(response.body).not.toContain('userId');
      expect(response.body).not.toContain(ana.userId);
      expect(response.body).not.toContain('@test.penka.dev');
      // What it does carry: who is playing, how they stand, when picks close.
      expect(everyPlayer(board).map((player) => player.displayName).sort()).toEqual(['ana', 'beto']);
      expect(everyPlayer(board).map((player) => player.lives)).toEqual([2, 2]);
      expect(everyPlayer(board).map((player) => player.points)).toEqual([0, 0]);
      expect(board.matchday).toBe(1);
      expect(board.history).toEqual([]);
      expect(board.nextPollInSec).toBe(10);
    });

    it('takes its polling cadence from the operator profile', async () => {
      const cora = await registerUser(app, 'cora');
      await app.redis.set('ops:pollingProfile', 'live');
      try {
        const penka = await createPenka(app, cora, LEAGUE);

        expect(boardOf(await getBoard(app, penka.id)).nextPollInSec).toBe(2);
      } finally {
        await app.redis.del('ops:pollingProfile');
      }
    });

    it('answers 404 penka_not_found for an unknown or malformed penka id', async () => {
      const unknown = await getBoard(app, UNKNOWN_PENKA_ID);
      const malformed = await getBoard(app, 'not-an-id');

      expect(unknown.statusCode).toBe(404);
      expect(codeOf(unknown)).toBe('penka_not_found');
      expect(malformed.statusCode).toBe(404);
      expect(malformed.body).toBe(unknown.body);
    });
  });

  describe('GET /api/v1/penkas/:penkaId/board — after lock', () => {
    // Owns this league: it moves the lock time every penka on it shares.
    const LEAGUE = 'champions-league';

    it('reveals what everyone played, and null for whoever never picked', async () => {
      const dana = await registerUser(app, 'dana');
      const elio = await registerUser(app, 'elio');
      const penka = await createPenka(app, dana, LEAGUE);
      await joinPenka(app, elio, penka.joinCode);
      const danaTeam = await playingTeam(LEAGUE);
      expect((await submitPick(app, dana, penka.id, danaTeam)).statusCode).toBe(200);

      await lockFirstMatchday(LEAGUE);
      const response = await getBoard(app, penka.id);

      expect(response.statusCode).toBe(200);
      expect(Value.Check(BoardResponseSchema, response.json())).toBe(true);
      const board = boardOf(response);
      expect(board.isLocked).toBe(true);
      expect(board.isResolved).toBe(false);
      const picks = new Map(
        everyPlayer(board).map((player) => [player.displayName, player.pick] as const),
      );
      // Revealing a pick at lock is the Survivor format, not a leak.
      expect(picks.get('dana')).toBe(danaTeam);
      // The same null as before lock; clients tell them apart with isLocked.
      expect(picks.get('elio')).toBeNull();
      // Still nothing personal: a revealed pick is not a used-team history.
      expect(response.body).not.toContain('usedTeams');
    });
  });

  describe('GET /api/v1/penkas/:penkaId/me', () => {
    const LEAGUE = 'copa-libertadores';

    it('answers with my delta, including the pick the board is hiding', async () => {
      const fede = await registerUser(app, 'fede');
      const penka = await createPenka(app, fede, LEAGUE, { lives: 3 });
      const team = await playingTeam(LEAGUE);
      await submitPick(app, fede, penka.id, team);

      const response = await getMyEntry(app, fede, penka.id);

      expect(response.statusCode).toBe(200);
      expect(Value.Check(MyEntryResponseSchema, response.json())).toBe(true);
      expect(response.json<{ myEntry: unknown }>().myEntry).toEqual({
        lives: 3,
        status: 'alive',
        myPick: team,
        usedTeams: [],
      });
      // The board for the same penka, at the same moment, says nothing.
      expect((await getBoard(app, penka.id)).body).not.toContain(team);
    });

    it('reports "no pick yet" as null instead of leaving it out', async () => {
      const gil = await registerUser(app, 'gil');
      const penka = await createPenka(app, gil, LEAGUE);

      const response = await getMyEntry(app, gil, penka.id);

      expect(response.statusCode).toBe(200);
      expect(myPickOf(response)).toBeNull();
    });

    it('requires authentication', async () => {
      const hana = await registerUser(app, 'hana');
      const penka = await createPenka(app, hana, LEAGUE);

      const response = await app.inject({ method: 'GET', url: `/api/v1/penkas/${penka.id}/me` });

      expect(response.statusCode).toBe(401);
      expect(codeOf(response)).toBe('unauthorized');
    });

    it('tells a non-member nothing a stranger could not already guess', async () => {
      const ivo = await registerUser(app, 'ivo');
      const outsider = await registerUser(app, 'outsider');
      const penka = await createPenka(app, ivo, LEAGUE);

      const notMine = await getMyEntry(app, outsider, penka.id);
      const doesNotExist = await getMyEntry(app, outsider, UNKNOWN_PENKA_ID);

      expect(notMine.statusCode).toBe(404);
      expect(codeOf(notMine)).toBe('penka_not_found');
      // Byte-identical: "you are not in it" must not read differently from
      // "it does not exist", or membership becomes probeable.
      expect(notMine.body).toBe(doesNotExist.body);
    });
  });

  describe('GET /api/v1/penkas/:penkaId/matchday/current', () => {
    const LEAGUE = 'copa-libertadores';

    it('serves the open matchday with its fixtures, to anyone', async () => {
      const jana = await registerUser(app, 'jana');
      const penka = await createPenka(app, jana, LEAGUE);

      const response = await getCurrentMatchday(app, penka.id);

      expect(response.statusCode).toBe(200);
      expect(Value.Check(CurrentMatchdayResponseSchema, response.json())).toBe(true);
      const body = response.json<{
        matchday: { id: string; number: number; status: string; leagueId: string };
        matches: { matchdayId: string; outcome: string | null }[];
      }>();
      expect(body.matchday.number).toBe(1);
      expect(body.matchday.status).toBe('open');
      expect(body.matchday.leagueId).toBe(LEAGUE);
      expect(body.matches).toHaveLength(4); // 8 teams, paired once each
      expect(body.matches.every((match) => match.matchdayId === body.matchday.id)).toBe(true);
      expect(body.matches.every((match) => match.outcome === null)).toBe(true);
    });

    it('answers 404 penka_not_found for an unknown penka', async () => {
      const response = await getCurrentMatchday(app, UNKNOWN_PENKA_ID);

      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('penka_not_found');
    });
  });

  describe('POST /api/v1/penkas/:penkaId/picks', () => {
    const LEAGUE = 'premier-league';

    it('records the pick and answers with the updated personal delta', async () => {
      const kira = await registerUser(app, 'kira');
      const penka = await createPenka(app, kira, LEAGUE);
      const team = await playingTeam(LEAGUE);

      const response = await submitPick(app, kira, penka.id, team);

      expect(response.statusCode).toBe(200);
      expect(Value.Check(SubmitPickResponseSchema, response.json())).toBe(true);
      expect(response.json<{ myEntry: unknown }>().myEntry).toEqual({
        lives: 2,
        status: 'alive',
        myPick: team,
        usedTeams: [],
      });
      const stored = await picksCollection(app.db).findOne({
        entryId: await entryIdOf(penka.id, kira),
      });
      expect(stored?.teamCode).toBe(team);
      expect(stored?.matchdayId).toBe(matchdayId(LEAGUE, 1));
    });

    it('lets a player change their mind until lock, without a second pick document', async () => {
      const lena = await registerUser(app, 'lena');
      const penka = await createPenka(app, lena, LEAGUE);
      const first = await playingTeam(LEAGUE, 0);
      const second = await playingTeam(LEAGUE, 2);
      const entryId = await entryIdOf(penka.id, lena);

      await submitPick(app, lena, penka.id, first);
      const changed = await submitPick(app, lena, penka.id, second);

      expect(changed.statusCode).toBe(200);
      expect(myPickOf(changed)).toBe(second);
      const picks = await picksCollection(app.db).find({ entryId }).toArray();
      expect(picks).toHaveLength(1);
      expect(picks[0]?.teamCode).toBe(second);
      // The delta the client just got is what /me answers on the next load.
      expect(myPickOf(await getMyEntry(app, lena, penka.id))).toBe(second);
    });

    it('refuses a team this entry has already spent', async () => {
      const mati = await registerUser(app, 'mati');
      const penka = await createPenka(app, mati, LEAGUE);
      const team = await playingTeam(LEAGUE);
      const entryId = await entryIdOf(penka.id, mati);
      await entriesCollection(app.db).updateOne(
        { penkaId: penka.id, userId: mati.userId },
        { $set: { usedTeams: [team] } },
      );

      const response = await submitPick(app, mati, penka.id, team);

      expect(response.statusCode).toBe(422);
      expect(codeOf(response)).toBe('team_already_used');
      expect(await picksCollection(app.db).countDocuments({ entryId })).toBe(0);
    });

    it('refuses a team that is not playing this matchday', async () => {
      const nico = await registerUser(app, 'nico');
      const penka = await createPenka(app, nico, LEAGUE);
      const entryId = await entryIdOf(penka.id, nico);

      // A Copa Libertadores side, in a Premier League penka.
      const response = await submitPick(app, nico, penka.id, 'RIV');

      expect(response.statusCode).toBe(422);
      expect(codeOf(response)).toBe('team_not_playing');
      expect(await picksCollection(app.db).countDocuments({ entryId })).toBe(0);
    });

    it('rejects a team code the catalog could never contain', async () => {
      const olga = await registerUser(app, 'olga');
      const penka = await createPenka(app, olga, LEAGUE);

      const response = await submitPick(app, olga, penka.id, 'not-a-code');

      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('validation_failed');
    });

    it('requires authentication', async () => {
      const pau = await registerUser(app, 'pau');
      const penka = await createPenka(app, pau, LEAGUE);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/penkas/${penka.id}/picks`,
        payload: { teamCode: await playingTeam(LEAGUE) },
      });

      expect(response.statusCode).toBe(401);
      expect(codeOf(response)).toBe('unauthorized');
    });

    it('answers a non-member exactly like an unknown penka', async () => {
      const quim = await registerUser(app, 'quim');
      const stranger = await registerUser(app, 'stranger');
      const penka = await createPenka(app, quim, LEAGUE);

      const response = await submitPick(app, stranger, penka.id, await playingTeam(LEAGUE));

      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('penka_not_found');
    });
  });

  describe('POST picks — when the game says no', () => {
    it('refuses a pick once the matchday has locked', async () => {
      // Owns this league: locking matchday 1 locks it for every penka on it.
      const LEAGUE = 'la-liga';
      const rita = await registerUser(app, 'rita');
      const penka = await createPenka(app, rita, LEAGUE);
      const team = await playingTeam(LEAGUE);
      await lockFirstMatchday(LEAGUE);

      const response = await submitPick(app, rita, penka.id, team);

      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('matchday_locked');
      const stored = await picksCollection(app.db).countDocuments({
        matchdayId: matchdayId(LEAGUE, 1),
      });
      expect(stored).toBe(0);
    });

    it('refuses a pick from a player the island is not open to', async () => {
      const LEAGUE = 'copa-america';
      const sol = await registerUser(app, 'sol');
      // With the island disabled, elimination is the end of the game.
      const penka = await createPenka(app, sol, LEAGUE, { islandEnabled: false });
      const team = await playingTeam(LEAGUE);
      await entriesCollection(app.db).updateOne(
        { penkaId: penka.id, userId: sol.userId },
        { $set: { status: 'island', lives: 0 } },
      );

      const response = await submitPick(app, sol, penka.id, team);

      expect(response.statusCode).toBe(409);
      expect(codeOf(response)).toBe('on_island');
    });
  });

  describe('two penkas on the same league', () => {
    // Owns this league: it locks matchday 1 to compare the two boards.
    const LEAGUE = 'fifa-world-cup';

    it('share the calendar and never each other picks', async () => {
      const tere = await registerUser(app, 'tere');
      const here = await createPenka(app, tere, LEAGUE);
      const there = await createPenka(app, tere, LEAGUE);
      const team = await playingTeam(LEAGUE);
      expect((await submitPick(app, tere, here.id, team)).statusCode).toBe(200);

      // The same matchday document answers for both penkas — one calendar.
      expect((await getCurrentMatchday(app, here.id)).body).toBe(
        (await getCurrentMatchday(app, there.id)).body,
      );
      expect(myPickOf(await getMyEntry(app, tere, here.id))).toBe(team);
      expect(myPickOf(await getMyEntry(app, tere, there.id))).toBeNull();

      await lockFirstMatchday(LEAGUE);

      expect(everyPlayer(boardOf(await getBoard(app, here.id))).map((p) => p.pick)).toEqual([team]);
      expect(everyPlayer(boardOf(await getBoard(app, there.id))).map((p) => p.pick)).toEqual([null]);
    });
  });

  describe('board cache', () => {
    const LEAGUE = 'copa-libertadores';

    it('computes once, then serves every later poll from Redis', async () => {
      const uli = await registerUser(app, 'uli');
      const vera = await registerUser(app, 'vera');
      const penka = await createPenka(app, uli, LEAGUE);
      const cacheKey = `penka:${penka.id}:board`;
      expect(await app.redis.get(cacheKey)).toBeNull();

      const first = await getBoard(app, penka.id);

      expect(everyPlayer(boardOf(first))).toHaveLength(1);
      expect(await app.redis.get(cacheKey)).not.toBeNull();
      const ttl = await app.redis.ttl(cacheKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);

      // Mongo now holds two entries; the cached board still shows one, which is
      // the point — a poll costs one Redis read for up to a minute.
      await joinPenka(app, vera, penka.joinCode);
      expect((await getBoard(app, penka.id)).body).toBe(first.body);

      // A pick does not invalidate it either: before lock the public board does
      // not change when someone picks, so there is nothing to rebuild.
      expect((await submitPick(app, uli, penka.id, await playingTeam(LEAGUE))).statusCode).toBe(200);
      expect((await getBoard(app, penka.id)).body).toBe(first.body);
      expect(await app.redis.get(cacheKey)).not.toBeNull();
    });

    it('rebuilds instead of failing when the cached entry is unreadable', async () => {
      const wes = await registerUser(app, 'wes');
      const penka = await createPenka(app, wes, LEAGUE);
      await app.redis.set(`penka:${penka.id}:board`, 'not json at all');

      const response = await getBoard(app, penka.id);

      expect(response.statusCode).toBe(200);
      expect(Value.Check(BoardResponseSchema, response.json())).toBe(true);
    });
  });

  describe('a half-materialized calendar', () => {
    // Last, and on the league whose lock time is already spent: this deletes
    // fixtures, and nothing after it may need them.
    const LEAGUE = 'la-liga';

    it('says the calendar is broken instead of serving no fixtures', async () => {
      const yago = await registerUser(app, 'yago');
      const penka = await createPenka(app, yago, LEAGUE);
      await matchesCollection(app.db).deleteMany({ matchdayId: matchdayId(LEAGUE, 1) });

      const response = await getCurrentMatchday(app, penka.id);

      // An empty fixture list would render as "no hay partidos" — a lie the
      // player cannot act on, and one no operator would ever see reported.
      expect(response.statusCode).toBe(500);
      expect(codeOf(response)).toBe('internal');
    });
  });
});
