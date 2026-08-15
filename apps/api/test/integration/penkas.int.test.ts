import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Value } from '@sinclair/typebox/value';
import {
  CreatePenkaResponseSchema,
  JoinPenkaResponseSchema,
  MyPenkasResponseSchema,
} from '@penka/contracts';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/config';
import type { JoinCodeGenerator } from '../../src/modules/penkas/join-code';
import { makeTestConfig, startInfra, type TestInfra } from './harness';

const PASSWORD = 'penka-password-1';
const LEAGUE = 'copa-libertadores';

interface TestUser {
  token: string;
  userId: string;
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
  return { token: body.tokens.accessToken, userId: body.user.id };
}

function bearer(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.token}` };
}

interface CreateOverrides {
  name?: string;
  leagueId?: string;
  settings?: { lives?: number; islandEnabled?: boolean };
}

function createPenka(app: FastifyInstance, user: TestUser, overrides: CreateOverrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/penkas',
    headers: bearer(user),
    payload: { name: 'Oficina BA', leagueId: LEAGUE, settings: {}, ...overrides },
  });
}

function joinPenka(app: FastifyInstance, user: TestUser, joinCode: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/penkas/join',
    headers: bearer(user),
    payload: { joinCode },
  });
}

function myPenkas(app: FastifyInstance, user: TestUser) {
  return app.inject({ method: 'GET', url: '/api/v1/me/penkas', headers: bearer(user) });
}

/** Hands out the given codes in order, repeating the last one forever. */
function codeSequence(...codes: string[]): JoinCodeGenerator {
  let index = 0;
  return () => {
    const code = codes[Math.min(index, codes.length - 1)] ?? '0000';
    index += 1;
    return code;
  };
}

describe('penkas endpoints', () => {
  let infra: TestInfra;
  let config: AppConfig;
  let app: FastifyInstance;

  beforeAll(async () => {
    infra = await startInfra();
    config = makeTestConfig(infra);
    app = buildApp({ config });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await infra.stop();
  });

  describe('POST /api/v1/penkas', () => {
    it('creates a penka with a 4-digit join code and the default settings', async () => {
      const ana = await registerUser(app, 'ana');

      const response = await createPenka(app, ana, { name: 'Oficina BA' });

      expect(response.statusCode).toBe(201);
      const body: unknown = response.json();
      expect(Value.Check(CreatePenkaResponseSchema, body)).toBe(true);
      const { penka } = response.json<{
        penka: {
          id: string;
          name: string;
          leagueId: string;
          joinCode: string;
          settings: { lives: number; islandEnabled: boolean };
        };
      }>();
      expect(penka.name).toBe('Oficina BA');
      expect(penka.leagueId).toBe(LEAGUE);
      expect(penka.joinCode).toMatch(/^\d{4}$/);
      expect(penka.settings).toEqual({ lives: 2, islandEnabled: true });
    });

    it('honors explicit settings', async () => {
      const beto = await registerUser(app, 'beto');

      const response = await createPenka(app, beto, {
        settings: { lives: 3, islandEnabled: false },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json<{ penka: { settings: unknown } }>().penka.settings).toEqual({
        lives: 3,
        islandEnabled: false,
      });
    });

    it('rejects more lives than the game allows', async () => {
      const carla = await registerUser(app, 'carla');

      const response = await createPenka(app, carla, { settings: { lives: 4 } });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ code: string }>().code).toBe('validation_failed');
    });

    it('refuses a league that is not in the catalog', async () => {
      const dario = await registerUser(app, 'dario');

      const response = await createPenka(app, dario, {
        name: 'Ghost league',
        leagueId: 'serie-a',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json<{ code: string }>().code).toBe('league_not_found');
      expect(await app.db.collection('penkas').countDocuments({ name: 'Ghost league' })).toBe(0);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/penkas',
        payload: { name: 'Anon', leagueId: LEAGUE, settings: {} },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json<{ code: string }>().code).toBe('unauthorized');
    });

    it('makes the creator the first entry, alive with the configured lives', async () => {
      const eva = await registerUser(app, 'eva');

      const created = await createPenka(app, eva, { settings: { lives: 3 } });
      const penkaId = created.json<{ penka: { id: string } }>().penka.id;

      const mine = await myPenkas(app, eva);
      expect(mine.statusCode).toBe(200);
      const { penkas } = mine.json<{
        penkas: { penka: { id: string }; entry: Record<string, unknown> }[];
      }>();
      const item = penkas.find((candidate) => candidate.penka.id === penkaId);
      expect(item?.entry).toMatchObject({
        penkaId,
        userId: eva.userId,
        lives: 3,
        status: 'alive',
        usedTeams: [],
        points: 0,
      });
    });
  });

  describe('league materialization', () => {
    it('materializes a league calendar once and shares it across penkas', async () => {
      const fito = await registerUser(app, 'fito');
      const gala = await registerUser(app, 'gala');

      await createPenka(app, fito);
      const matchdays = await app.db.collection('matchdays').find({ leagueId: LEAGUE }).toArray();
      const matchCount = await app.db.collection('matches').countDocuments({ leagueId: LEAGUE });

      expect(matchdays).toHaveLength(3);
      expect(matchCount).toBe(12); // 8 teams → 4 matchups × 3 matchdays

      const second = await createPenka(app, gala);
      expect(second.statusCode).toBe(201);

      const after = await app.db.collection('matchdays').find({ leagueId: LEAGUE }).toArray();
      expect(after).toHaveLength(3);
      expect(await app.db.collection('matches').countDocuments({ leagueId: LEAGUE })).toBe(12);
      // The second penka reuses the calendar rather than resetting the clock.
      expect(after.map((matchday) => matchday.lockAt)).toEqual(
        matchdays.map((matchday) => matchday.lockAt),
      );
    });

    it('gives every league its own calendar', async () => {
      const hugo = await registerUser(app, 'hugo');

      await createPenka(app, hugo, { leagueId: 'fifa-world-cup' });

      expect(
        await app.db.collection('matchdays').countDocuments({ leagueId: 'fifa-world-cup' }),
      ).toBe(3);
      // 16 teams → 8 matchups × 3 matchdays
      expect(
        await app.db.collection('matches').countDocuments({ leagueId: 'fifa-world-cup' }),
      ).toBe(24);
    });

    it('finishes a calendar that was left half written', async () => {
      const jose = await registerUser(app, 'jose');
      const kira = await registerUser(app, 'kira');

      await createPenka(app, jose, { leagueId: 'premier-league' });
      // A run that inserted the matchdays and died before the matches: the
      // league must not stay stranded with a calendar nobody can play.
      await app.db.collection('matches').deleteMany({ leagueId: 'premier-league' });

      const second = await createPenka(app, kira, { leagueId: 'premier-league' });

      expect(second.statusCode).toBe(201);
      expect(
        await app.db.collection('matchdays').countDocuments({ leagueId: 'premier-league' }),
      ).toBe(3);
      expect(
        await app.db.collection('matches').countDocuments({ leagueId: 'premier-league' }),
      ).toBe(12); // 8 teams → 4 matchups × 3 matchdays
    });

    it('leaves no penka behind when the calendar cannot be written', async () => {
      const lena = await registerUser(app, 'lena');
      // Reject every matchday insert, so materialization fails after the penka
      // itself was already stored — the two now run concurrently.
      await app.db.command({
        collMod: 'matchdays',
        validator: { $jsonSchema: { required: ['thisFieldNeverExists'] } },
      });

      try {
        const response = await createPenka(app, lena, {
          name: 'Doomed calendar',
          leagueId: 'champions-league',
        });

        expect(response.statusCode).toBe(500);
        // The penka would otherwise sit on a join code with no players and no
        // calendar, invisible to every endpoint.
        expect(await app.db.collection('penkas').countDocuments({ name: 'Doomed calendar' })).toBe(
          0,
        );
      } finally {
        await app.db.command({ collMod: 'matchdays', validator: {} });
      }
    });

    it('locks matchday 1 two hours after the league was materialized', async () => {
      const ines = await registerUser(app, 'ines');

      const before = Date.now();
      await createPenka(app, ines, { leagueId: 'la-liga' });

      // The id is derived from the league, not generated — see calendar.ts.
      const first = await app.db
        .collection<{ _id: string; lockAt: Date }>('matchdays')
        .findOne({ _id: 'la-liga:md1' });
      const lockAt = (first?.lockAt ?? new Date(0)).getTime();
      expect(lockAt).toBeGreaterThanOrEqual(before + 120 * 60_000);
      expect(lockAt).toBeLessThanOrEqual(Date.now() + 120 * 60_000);
    });
  });

  describe('join code allocation', () => {
    it('retries with a fresh code when the generated one is taken', async () => {
      const collide = buildApp({
        config: makeTestConfig(infra),
        generateJoinCode: codeSequence('1234', '1234', '5678'),
      });
      try {
        await collide.ready();
        const juan = await registerUser(collide, 'juan');
        const kira = await registerUser(collide, 'kira');

        const first = await createPenka(collide, juan);
        const second = await createPenka(collide, kira);

        expect(first.json<{ penka: { joinCode: string } }>().penka.joinCode).toBe('1234');
        expect(second.statusCode).toBe(201);
        expect(second.json<{ penka: { joinCode: string } }>().penka.joinCode).toBe('5678');
      } finally {
        await collide.close();
      }
    });

    it('gives up with 503 join_code_space_exhausted after the retry budget', async () => {
      const exhausted = buildApp({
        config: makeTestConfig(infra),
        generateJoinCode: codeSequence('1234'),
      });
      try {
        await exhausted.ready();
        const lu = await registerUser(exhausted, 'lu');
        const mar = await registerUser(exhausted, 'mar');

        expect((await createPenka(exhausted, lu)).statusCode).toBe(201);
        const response = await createPenka(exhausted, mar, { name: 'Doomed' });

        expect(response.statusCode).toBe(503);
        expect(response.json<{ code: string }>().code).toBe('join_code_space_exhausted');
        expect(await exhausted.db.collection('penkas').countDocuments({ name: 'Doomed' })).toBe(0);
      } finally {
        await exhausted.close();
      }
    });
  });

  describe('POST /api/v1/penkas/join', () => {
    it('adds the joiner as an alive entry with the penka settings', async () => {
      const nadia = await registerUser(app, 'nadia');
      const omar = await registerUser(app, 'omar');
      const created = await createPenka(app, nadia, { settings: { lives: 3 } });
      const { penka } = created.json<{ penka: { id: string; joinCode: string } }>();

      const response = await joinPenka(app, omar, penka.joinCode);

      expect(response.statusCode).toBe(200);
      const body: unknown = response.json();
      expect(Value.Check(JoinPenkaResponseSchema, body)).toBe(true);
      expect(response.json<{ penka: { id: string } }>().penka.id).toBe(penka.id);
      expect(response.json<{ entry: Record<string, unknown> }>().entry).toMatchObject({
        penkaId: penka.id,
        userId: omar.userId,
        lives: 3,
        status: 'alive',
        usedTeams: [],
        points: 0,
      });
    });

    it('is idempotent: joining twice returns the same entry', async () => {
      const pia = await registerUser(app, 'pia');
      const raul = await registerUser(app, 'raul');
      const created = await createPenka(app, pia);
      const { penka } = created.json<{ penka: { id: string; joinCode: string } }>();

      const first = await joinPenka(app, raul, penka.joinCode);
      const second = await joinPenka(app, raul, penka.joinCode);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json<{ entry: { id: string } }>().entry.id).toBe(
        first.json<{ entry: { id: string } }>().entry.id,
      );
      expect(
        await app.db
          .collection('entries')
          .countDocuments({ penkaId: penka.id, userId: raul.userId }),
      ).toBe(1);
    });

    it('lets the creator "join" their own penka without a second entry', async () => {
      const sara = await registerUser(app, 'sara');
      const created = await createPenka(app, sara);
      const { penka } = created.json<{ penka: { id: string; joinCode: string } }>();

      const response = await joinPenka(app, sara, penka.joinCode);

      expect(response.statusCode).toBe(200);
      expect(response.json<{ entry: { userId: string } }>().entry.userId).toBe(sara.userId);
      expect(await app.db.collection('entries').countDocuments({ penkaId: penka.id })).toBe(1);
    });

    it('answers unknown and malformed codes with the same 404', async () => {
      const tito = await registerUser(app, 'tito');

      const unknown = await joinPenka(app, tito, '0000');
      const malformed = await joinPenka(app, tito, 'not-a-code');
      const empty = await joinPenka(app, tito, '');

      for (const response of [unknown, malformed, empty]) {
        expect(response.statusCode).toBe(404);
        expect(response.json<{ code: string }>().code).toBe('invalid_join_code');
      }
      // Byte-identical: a guesser learns nothing from the shape of their input.
      expect(malformed.body).toBe(unknown.body);
      expect(empty.body).toBe(unknown.body);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/penkas/join',
        payload: { joinCode: '1234' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/me/penkas', () => {
    it('lists what I created and what I joined, newest first', async () => {
      const uma = await registerUser(app, 'uma');
      const vito = await registerUser(app, 'vito');
      const own = await createPenka(app, uma, { name: 'Mine' });
      const hosted = await createPenka(app, vito, { name: 'Theirs' });
      await joinPenka(app, uma, hosted.json<{ penka: { joinCode: string } }>().penka.joinCode);

      const response = await myPenkas(app, uma);

      expect(response.statusCode).toBe(200);
      const body: unknown = response.json();
      expect(Value.Check(MyPenkasResponseSchema, body)).toBe(true);
      const { penkas } = response.json<{ penkas: { penka: { id: string; name: string } }[] }>();
      expect(penkas.map((item) => item.penka.name)).toEqual(['Theirs', 'Mine']);
      expect(penkas[1]?.penka.id).toBe(own.json<{ penka: { id: string } }>().penka.id);
    });

    it('still lists the good penkas when one entry points nowhere', async () => {
      const xime = await registerUser(app, 'xime');
      await createPenka(app, xime, { name: 'Real one' });
      // An entry whose penkaId is not an id at all — corruption, a bad manual
      // edit, a future migration slip. One rotten row must not cost this player
      // the rest of their list.
      await app.db.collection('entries').insertOne({
        penkaId: 'not-an-object-id',
        userId: xime.userId,
        lives: 2,
        status: 'alive',
        usedTeams: [],
        points: 0,
        createdAt: new Date(),
      });

      const response = await myPenkas(app, xime);

      expect(response.statusCode).toBe(200);
      const { penkas } = response.json<{ penkas: { penka: { name: string } }[] }>();
      expect(penkas.map((item) => item.penka.name)).toEqual(['Real one']);
    });

    it('is empty for a player who has not joined anything', async () => {
      const wanda = await registerUser(app, 'wanda');

      const response = await myPenkas(app, wanda);

      expect(response.statusCode).toBe(200);
      expect(response.json<{ penkas: unknown[] }>().penkas).toEqual([]);
    });

    it('requires authentication', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/me/penkas' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('join rate limiting', () => {
    // Users register on the generously-limited main app and reuse their tokens
    // here: the throttled app shares its database and signing key, so the only
    // thing that changes is how many join attempts it will take.
    it('throttles per IP, so one host cannot walk the code space', async () => {
      const one = await registerUser(app, 'one');
      const two = await registerUser(app, 'two');
      const hammer = buildApp({
        config: makeTestConfig(infra, {
          mongoDbName: config.mongoDbName,
          rateLimitMax: 1,
          redisUrl: `${infra.redisUrl}/5`,
        }),
      });
      try {
        await hammer.ready();

        expect((await joinPenka(hammer, one, '0000')).statusCode).toBe(404);
        // Different user, same host: the IP budget is already spent.
        const throttled = await joinPenka(hammer, two, '0001');

        expect(throttled.statusCode).toBe(429);
        expect(throttled.json<{ code: string }>().code).toBe('rate_limited');
      } finally {
        await hammer.close();
      }
    });

    it('throttles per user, so switching IP does not buy a fresh budget', async () => {
      const guesser = await registerUser(app, 'guesser');
      const hammer = buildApp({
        config: makeTestConfig(infra, {
          mongoDbName: config.mongoDbName,
          rateLimitMax: 1,
          redisUrl: `${infra.redisUrl}/6`,
          trustProxy: true,
        }),
      });
      const attempt = (user: TestUser, clientIp: string) =>
        hammer.inject({
          method: 'POST',
          url: '/api/v1/penkas/join',
          headers: { ...bearer(user), 'x-forwarded-for': clientIp },
          payload: { joinCode: '0000' },
        });
      try {
        await hammer.ready();

        expect((await attempt(guesser, '203.0.113.10')).statusCode).toBe(404);
        const throttled = await attempt(guesser, '203.0.113.11');

        expect(throttled.statusCode).toBe(429);
        expect(throttled.json<{ code: string }>().code).toBe('rate_limited');
      } finally {
        await hammer.close();
      }
    });
  });
});
