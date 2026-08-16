/**
 * Resolution end to end: the API validates and PUBLISHES, and nothing here
 * resolves anything. The whole file follows one operator through the real
 * sequence — close, load results, resolve — so the `it`s run in order and each
 * builds on the state the previous one left. Redis database claims are
 * documented at the top of admin.int.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { Value } from '@sinclair/typebox/value';
import {
  ResolveMatchdayCommandSchema,
  ResolveMatchdayResponseSchema,
  matchdayId,
  resolveMessageId,
  resolveRoutingKey,
} from '@penka/contracts';
import { buildApp } from '../../src/app';
import { createResolutionPublisher } from '../../src/messaging/publisher';
import {
  matchdaysCollection,
  matchesCollection,
  penkasCollection,
} from '../../src/modules/admin/store';
import {
  adminHeaders,
  captureLogs,
  connectTestBroker,
  makeTestConfig,
  startInfra,
  type TestBroker,
  type TestInfra,
} from './harness';
import { buildPlayerApi, createPenka, registerUser, type TestPenka } from './seed';

const DB_NAME = `penka-test-${randomUUID().slice(0, 8)}`;
const LEAGUE = 'copa-libertadores';
const MATCHDAY_ID = matchdayId(LEAGUE, 1);

let infra: TestInfra;
let admin: FastifyInstance;
let player: FastifyInstance;
let broker: TestBroker;
/** Two penkas on the league being resolved, and one on another league. */
let first: TestPenka;
let second: TestPenka;
let elsewhere: TestPenka;

beforeAll(async () => {
  infra = await startInfra();
  admin = buildApp({ config: makeTestConfig(infra, { mongoDbName: DB_NAME }) });
  player = buildPlayerApi(infra, DB_NAME);
  await Promise.all([admin.ready(), player.ready()]);
  broker = await connectTestBroker(infra.rabbitUrl);

  const [owner, joiner, outsider] = await Promise.all([
    registerUser(player, 'resolve-first'),
    registerUser(player, 'resolve-second'),
    registerUser(player, 'resolve-outsider'),
  ]);
  first = await createPenka(player, owner, LEAGUE);
  second = await createPenka(player, joiner, LEAGUE);
  elsewhere = await createPenka(player, outsider, 'la-liga');
}, 180_000);

afterAll(async () => {
  await broker.close();
  await Promise.all([admin.close(), player.close()]);
  await infra.stop();
});

function resolve(leagueId = LEAGUE, number = 1) {
  return admin.inject({
    method: 'POST',
    url: `/admin/v1/leagues/${leagueId}/matchdays/${number}/resolve`,
    headers: adminHeaders(),
  });
}

function close(leagueId = LEAGUE, number = 1) {
  return admin.inject({
    method: 'POST',
    url: `/admin/v1/leagues/${leagueId}/matchdays/${number}/close`,
    headers: adminHeaders(),
  });
}

async function setEveryResult(leagueId: string, number = 1): Promise<void> {
  const matches = await matchesCollection(admin.db)
    .find({ matchdayId: matchdayId(leagueId, number) })
    .toArray();
  for (const match of matches) {
    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${encodeURIComponent(match._id)}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'home' },
    });
    expect(response.statusCode).toBe(200);
  }
}

function codeOf(response: { json: <T>() => T }): string {
  return response.json<{ code: string }>().code;
}

async function storedMatchday(id = MATCHDAY_ID) {
  return matchdaysCollection(admin.db).findOne({ _id: id });
}

describe('POST /admin/v1/leagues/:leagueId/matchdays/:number/resolve', () => {
  it('refuses an open matchday and publishes nothing', async () => {
    // Lock is a precondition of resolution in the engine, so the API says so at
    // its boundary rather than queueing work the workers would only reject.
    const response = await resolve();

    expect(response.statusCode).toBe(409);
    expect(codeOf(response)).toBe('matchday_not_locked');
    expect(await broker.drain()).toEqual([]);
    expect(await storedMatchday()).not.toHaveProperty('resolveRequestedAt');
  });

  it('refuses a closed matchday whose results are not all in', async () => {
    expect((await close()).statusCode).toBe(200);

    const response = await resolve();

    expect(response.statusCode).toBe(409);
    expect(codeOf(response)).toBe('results_missing');
    expect(await broker.drain()).toEqual([]);
    expect(await storedMatchday()).not.toHaveProperty('resolveRequestedAt');
  });

  it('says how much is missing while the operator loads results', async () => {
    const matches = await matchesCollection(admin.db).find({ matchdayId: MATCHDAY_ID }).toArray();
    const last = matches[matches.length - 1];

    const response = await admin.inject({
      method: 'POST',
      url: `/admin/v1/matches/${encodeURIComponent(last?._id ?? '')}/result`,
      headers: adminHeaders(),
      payload: { outcome: 'draw' },
    });

    expect(response.json()).toMatchObject({
      pendingMatches: matches.length - 1,
      // Closed but incomplete: resolve would still be refused.
      readyToResolve: false,
    });
  });

  it('publishes one command per penka of the league, and only those', async () => {
    await setEveryResult(LEAGUE);

    const response = await resolve();

    expect(response.statusCode).toBe(200);
    const body = response.json<{ queued: boolean; matchdayId: string }>();
    expect(Value.Check(ResolveMatchdayResponseSchema, body)).toBe(true);
    expect(body).toEqual({ queued: true, matchdayId: MATCHDAY_ID });

    const published = await broker.drain();
    expect(published).toHaveLength(2);
    expect(published.map((message) => message.routingKey).sort()).toEqual(
      [resolveRoutingKey(first.id), resolveRoutingKey(second.id)].sort(),
    );
    // The penka on another league plays a different calendar: resolving this
    // matchday must not touch it.
    expect(published.map((message) => message.routingKey)).not.toContain(
      resolveRoutingKey(elsewhere.id),
    );

    for (const message of published) {
      const command = message.body as { penkaId: string; requestedAt: string };
      expect(Value.Check(ResolveMatchdayCommandSchema, command)).toBe(true);
      expect(command).toMatchObject({ leagueId: LEAGUE, matchday: 1 });
      expect(message.routingKey).toBe(resolveRoutingKey(command.penkaId));
      // Deterministic: the same request twice carries the same id, which is
      // what lets a worker recognize work it has already done.
      expect(message.messageId).toBe(resolveMessageId(command.penkaId, 1));
      expect(message.persistent).toBe(true);
      expect(message.contentType).toBe('application/json');
      expect(Date.parse(command.requestedAt)).toBeLessThanOrEqual(Date.now());
    }
  });

  it('marks the matchday as requested without calling it resolved', async () => {
    // "An operator pressed resolve" is not a state of the game: the status is
    // still locked, and only the workers make it resolved.
    const matchday = await storedMatchday();

    expect(matchday?.resolveRequestedAt).toBeInstanceOf(Date);
    expect(matchday?.status).toBe('locked');
  });

  it('republishes on a second press rather than pretending it is done', async () => {
    // Resolution is only complete when the workers say so, so the marker is not
    // a gate. Pressing again costs duplicate messages, which the deterministic
    // ids make harmless — and that beats a matchday nobody can retry.
    const response = await resolve();

    expect(response.statusCode).toBe(200);
    expect(await broker.drain()).toHaveLength(2);
  });

  it('republishes the first request, not a new one', async () => {
    // Every command of a matchday carries the SAME requestedAt, because the
    // workers count that same set to decide the matchday is finished. Two
    // presses with two timestamps would be two different sets.
    const stamp = (await storedMatchday())?.resolveRequestedAt;
    expect(stamp).toBeInstanceOf(Date);

    expect((await resolve()).statusCode).toBe(200);

    const published = await broker.drain();
    expect(published).toHaveLength(2);
    for (const message of published) {
      expect((message.body as { requestedAt: string }).requestedAt).toBe(stamp?.toISOString());
    }
    expect((await storedMatchday())?.resolveRequestedAt).toEqual(stamp);
  });

  it('leaves a penka created after the request out of the fan-out', async () => {
    // The stranding case: a penka that joins between two presses must not appear
    // in the second one. It is not counted by the workers' finalize either — both
    // sides read `createdAt <= requestedAt` off the same stored timestamp — so it
    // can neither be silently skipped nor hold the matchday open for everyone.
    const latecomer = await createPenka(player, await registerUser(player, 'resolve-late'), LEAGUE);
    const stamp = (await storedMatchday())?.resolveRequestedAt;
    expect(stamp).toBeInstanceOf(Date);
    const stored = await penkasCollection(admin.db).findOne({
      _id: ObjectId.createFromHexString(latecomer.id),
    });
    expect(stored?.createdAt.getTime()).toBeGreaterThan(stamp?.getTime() ?? 0);

    expect((await resolve()).statusCode).toBe(200);

    const published = await broker.drain();
    expect(published).toHaveLength(2);
    expect(published.map((message) => message.routingKey)).not.toContain(
      resolveRoutingKey(latecomer.id),
    );
  });

  it('is a 404 for a matchday that does not exist', async () => {
    const response = await resolve(LEAGUE, 9);

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('matchday_not_found');
  });

  it('refuses a league nobody plays instead of queueing nothing', async () => {
    // A complete, closed calendar with nobody playing it. Written by hand
    // because @penka/api only ever materializes a league for a penka, which is
    // precisely the situation this test needs to not exist.
    await matchdaysCollection(admin.db).insertOne({
      _id: matchdayId('champions-league', 1),
      leagueId: 'champions-league',
      number: 1,
      status: 'locked',
      lockAt: new Date(),
    });
    await matchesCollection(admin.db).insertOne({
      _id: 'champions-league:md1:RMA-BAR',
      matchdayId: matchdayId('champions-league', 1),
      leagueId: 'champions-league',
      homeTeamCode: 'RMA',
      awayTeamCode: 'BAR',
      kickoffAt: new Date(),
      outcome: 'home',
    });

    const response = await resolve('champions-league');

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('penka_not_found');
    expect(await broker.drain()).toEqual([]);
  });
});

describe('when publishing fails', () => {
  let brokenApp: FastifyInstance;
  let logs: ReturnType<typeof captureLogs>;

  beforeAll(async () => {
    // A genuinely broken channel, not a stub: a real confirm channel that has
    // been closed. amqplib refuses to publish on it exactly as it would after
    // the broker dropped the connection.
    const channel = await broker.channel();
    await channel.close();
    logs = captureLogs();
    brokenApp = buildApp({
      config: makeTestConfig(infra, { mongoDbName: DB_NAME }),
      logger: logs.logger,
      publisher: createResolutionPublisher(channel),
    });
    await brokenApp.ready();

    const owner = await registerUser(player, 'broken-owner');
    await createPenka(player, owner, 'premier-league');
    await setEveryResult('premier-league');
  }, 120_000);

  afterAll(async () => {
    await brokenApp.close();
  });

  it('leaves nothing marked as requested and nothing in the queue', async () => {
    expect(
      (
        await brokenApp.inject({
          method: 'POST',
          url: '/admin/v1/leagues/premier-league/matchdays/1/close',
          headers: adminHeaders(),
        })
      ).statusCode,
    ).toBe(200);

    const response = await brokenApp.inject({
      method: 'POST',
      url: '/admin/v1/leagues/premier-league/matchdays/1/resolve',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(500);
    expect(codeOf(response)).toBe('internal');
    // The one state nobody recovers from would be a matchday that looks
    // requested with nothing queued: it reads as done, so nobody presses again.
    expect(await storedMatchday(matchdayId('premier-league', 1))).not.toHaveProperty(
      'resolveRequestedAt',
    );
    expect(await broker.drain()).toEqual([]);
  });

  it('logs the rollback instead of throwing a second error over the first', async () => {
    // The operator gets the publish failure, which is the real cause; the
    // compensation only leaves a trace.
    const messages = logs.lines.map((line) => String(line.msg));

    expect(messages).toContain('rolled back resolveRequestedAt after a failed publish');
  });
});
