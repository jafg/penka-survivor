import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  RESOLUTION_QUEUE,
  boardCacheKey,
  matchdayId as buildMatchdayId,
  resolveMessageId,
  type Board,
  type Match,
  type ResolveMatchdayCommand,
} from '@penka/contracts';
import { pickResultOf, resolveMatchday, type ResolutionOutcome } from '@penka/game-engine';
import { ATTEMPT_HEADER } from '../../src/messaging/consumer';
import {
  entriesCollection,
  matchdaysCollection,
  matchesCollection,
  penkasCollection,
  picksCollection,
  resolutionsCollection,
  toEntry,
  toMatch,
  toMatchday,
  toPlayerPick,
  type EntryDoc,
} from '../../src/modules/resolution/store';
import {
  connectTestBroker,
  eventually,
  startInfra,
  startStack,
  type TestBroker,
  type TestInfra,
  type TestStack,
} from './harness';
import {
  LEAGUE_ID,
  closeMatchday,
  createPenka,
  getBoard,
  joinPenka,
  listMatches,
  registerUser,
  requestResolve,
  setAllResults,
  setResult,
  submitPick,
  type TestPenka,
  type TestUser,
} from './seed';

/**
 * The whole pipeline, end to end, with nothing faked: a player creates a penka
 * and picks through @penka/api, an operator closes the matchday, loads results
 * and presses resolve through @penka/backoffice-api, the real publisher puts a
 * real command on a real RabbitMQ, and this worker consumes it against a real
 * Mongo and Redis.
 *
 * **Redis databases /11 and /12 belong to @penka/workers.** The repo splits the
 * shared Redis by module so two suites never flush each other's keys: /1–/4
 * auth, /5–/6 penkas, /7–/8 game, /9–/10 backoffice, /11–/12 here. This file
 * uses /11; /12 is reserved for the next one.
 *
 * Mongo is split per test instead of per module — `startStack` generates one
 * database name and gives it to the worker AND to both APIs, so the seeding side
 * and the resolving side always look at the same data.
 */
const REDIS_DB = 11;

/** Matchday 1 of every league, the one these tests resolve. */
const MATCHDAY = 1;
const MATCHDAY_ID = buildMatchdayId(LEAGUE_ID, MATCHDAY);

let infra: TestInfra;
let broker: TestBroker;
let stack: TestStack;

beforeAll(async () => {
  infra = await startInfra();
  broker = await connectTestBroker(infra.rabbitUrl);
}, 180_000);

afterAll(async () => {
  await broker.close();
  await infra.stop();
});

beforeEach(async () => {
  // The broker is the one thing every test shares. A message left behind by a
  // previous test would be consumed by the next test's worker against a
  // database it knows nothing about.
  await broker.purge();
});

afterEach(async () => {
  await stack.stop();
});

// ── Fixtures ───────────────────────────────────────────────────────────────

interface Fixture {
  penka: TestPenka;
  /** Backed the home side of the first match, which wins. */
  winner: TestUser;
  /** Backed the away side of the second match, which loses. */
  loser: TestUser;
  /** Never picked at all — a missed pick costs a life like a wrong one. */
  absentee: TestUser;
  matches: Match[];
}

/**
 * Three players, three fates. Lives default to 1 here so a single matchday
 * actually eliminates somebody: with the default 2 nothing but points would
 * change, and the interesting write paths (status, elimination, history) would
 * never run.
 */
async function seedFixture(
  current: TestStack,
  label: string,
  settings: { lives?: number; islandEnabled?: boolean } = { lives: 1 },
): Promise<Fixture> {
  const winner = await registerUser(current.player, `${label}-winner`);
  const loser = await registerUser(current.player, `${label}-loser`);
  const absentee = await registerUser(current.player, `${label}-absentee`);

  const penka = await createPenka(current.player, winner, { name: label, settings });
  await joinPenka(current.player, loser, penka.joinCode);
  await joinPenka(current.player, absentee, penka.joinCode);

  // Teams come from the materialized calendar, never from a hardcoded pairing:
  // the fixture template decides who is home.
  const matches = await listMatches(current.admin, MATCHDAY);
  await submitPick(current.player, winner, penka.id, matches[0]!.homeTeamCode);
  await submitPick(current.player, loser, penka.id, matches[1]!.awayTeamCode);

  return { penka, winner, loser, absentee, matches };
}

interface Snapshot {
  outcome: ResolutionOutcome;
  entriesBefore: Map<string, EntryDoc>;
}

/**
 * What the pure engine says should happen, computed in the test from the same
 * documents the worker will read — and computed **before** the worker runs, so
 * the comparison afterwards is against an independent answer rather than
 * against whatever the worker happened to write.
 */
async function snapshotEngineOutcome(db: Db, penkaId: string): Promise<Snapshot> {
  const [penka, matchday, matches, entries] = await Promise.all([
    penkasCollection(db).findOne({ _id: ObjectId.createFromHexString(penkaId) }),
    matchdaysCollection(db).findOne({ _id: MATCHDAY_ID }),
    matchesCollection(db).find({ matchdayId: MATCHDAY_ID }).toArray(),
    entriesCollection(db).find({ penkaId }).toArray(),
  ]);
  expect(penka).not.toBeNull();
  expect(matchday).not.toBeNull();
  const picks = await picksCollection(db)
    .find({
      matchdayId: MATCHDAY_ID,
      entryId: { $in: entries.map((entry) => entry._id.toHexString()) },
    })
    .toArray();

  const result = resolveMatchday({
    matchday: toMatchday(matchday!),
    entries: entries.map(toEntry),
    picks: picks.map(toPlayerPick),
    matches: matches.map(toMatch),
    settings: penka!.settings,
  });
  if (!result.ok) {
    throw new Error(`the engine refused to resolve the fixture: ${result.code}`);
  }
  return {
    outcome: result.outcome,
    entriesBefore: new Map(entries.map((entry) => [entry._id.toHexString(), entry])),
  };
}

/** Every entry of a penka, keyed by id, as stored right now. */
async function entriesNow(db: Db, penkaId: string): Promise<Map<string, EntryDoc>> {
  const docs = await entriesCollection(db).find({ penkaId }).toArray();
  return new Map(docs.map((doc) => [doc._id.toHexString(), doc]));
}

async function cachedBoard(current: TestStack, penkaId: string): Promise<Board | null> {
  const raw = await current.redis.get(boardCacheKey(penkaId));
  return raw === null ? null : (JSON.parse(raw) as Board);
}

/** Wait until this penka's resolution marker exists — the worker's "done". */
async function awaitResolution(current: TestStack, penkaId: string): Promise<void> {
  await eventually(async () => {
    const marker = await resolutionsCollection(current.db).findOne({
      penkaId,
      matchdayId: MATCHDAY_ID,
    });
    expect(marker).not.toBeNull();
  });
}

function logMessages(current: TestStack): string[] {
  return current.logs.map((line) => String(line['msg'] ?? ''));
}

function countLogged(current: TestStack, message: string): number {
  return logMessages(current).filter((each) => each.includes(message)).length;
}

function commandFor(penka: TestPenka): ResolveMatchdayCommand {
  return {
    penkaId: penka.id,
    leagueId: LEAGUE_ID,
    matchday: MATCHDAY,
    requestedAt: new Date().toISOString(),
  };
}

/**
 * Assert the stored state equals the engine's outcome, effect by effect. This is
 * the worker's entire contract with `@penka/game-engine`: it applies what the
 * engine returned and computes nothing of its own.
 */
async function expectStateMatchesOutcome(
  current: TestStack,
  penkaId: string,
  snapshot: Snapshot,
): Promise<void> {
  const after = await entriesNow(current.db, penkaId);

  for (const effect of snapshot.outcome.effects) {
    const before = snapshot.entriesBefore.get(effect.entryId);
    const entry = after.get(effect.entryId);
    expect(before, `entry ${effect.entryId} was not in the snapshot`).toBeDefined();
    expect(entry, `entry ${effect.entryId} disappeared`).toBeDefined();

    expect(entry!.lives).toBe(effect.newLives);
    expect(entry!.status).toBe(effect.newStatus);
    expect(entry!.points).toBe(before!.points + effect.pointsDelta);
    expect(entry!.usedTeams).toEqual(
      effect.teamConsumed === null ? before!.usedTeams : [...before!.usedTeams, effect.teamConsumed],
    );

    // Picks are labelled from the same effect, so a settled pick can never
    // disagree with the life it cost.
    const pick = await picksCollection(current.db).findOne({
      entryId: effect.entryId,
      matchdayId: MATCHDAY_ID,
    });
    if (pick !== null) {
      expect(pick.result).toBe(pickResultOf(effect));
    }
  }

  const marker = await resolutionsCollection(current.db).findOne({
    penkaId,
    matchdayId: MATCHDAY_ID,
  });
  expect(marker).not.toBeNull();
  expect([...marker!.eliminatedEntryIds].sort()).toEqual(
    [...snapshot.outcome.eliminatedEntryIds].sort(),
  );
  expect([...marker!.islandEntryIds].sort()).toEqual(
    snapshot.outcome.effects
      .filter((effect) => effect.newStatus === 'island')
      .map((effect) => effect.entryId)
      .sort(),
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('matchday resolution, end to end', () => {
  it('resolves a matchday the operator closed and refreshes the board players poll', async () => {
    stack = await startStack(infra, { redisDb: REDIS_DB });
    const { penka, winner, loser, absentee, matches } = await seedFixture(stack, 'happy');

    await closeMatchday(stack.admin, MATCHDAY);
    // Read the board once while the matchday is locked and unresolved. This is
    // what players are looking at when the operator presses resolve — and it is
    // now in the cache, so the worker has something stale to overwrite.
    const locked = await getBoard(stack.player, penka.id);
    expect(locked.matchday).toBe(MATCHDAY);
    expect(locked.isLocked).toBe(true);
    expect(locked.isResolved).toBe(false);
    // Post-lock the picks are public: this is the 5b contract, and the board the
    // worker rebuilds has to keep honouring it.
    expect(locked.alive.map((player) => String(player.pick)).sort()).toEqual(
      [matches[0]!.homeTeamCode, matches[1]!.awayTeamCode, 'null'].sort(),
    );

    await setAllResults(stack.admin, MATCHDAY);
    const snapshot = await snapshotEngineOutcome(stack.db, penka.id);
    // The fixture is only worth running if it eliminates somebody.
    expect(snapshot.outcome.eliminatedEntryIds).toHaveLength(2);

    await requestResolve(stack.admin, MATCHDAY);
    await awaitResolution(stack, penka.id);

    await expectStateMatchesOutcome(stack, penka.id, snapshot);

    // The shared matchday is finished for the whole league: this penka was the
    // only one on it, so the calendar advances.
    const matchday = await matchdaysCollection(stack.db).findOne({ _id: MATCHDAY_ID });
    expect(matchday?.status).toBe('resolved');

    const board = await eventually(async () => {
      const current = await cachedBoard(stack, penka.id);
      // Not the board that was cached before the resolution.
      expect(current?.matchday).toBe(MATCHDAY + 1);
      return current!;
    });
    expect(board.isResolved).toBe(false);
    expect(board.isLocked).toBe(false);
    expect(board.alive).toEqual([
      { displayName: winner.displayName, lives: 1, points: 1, pick: null },
    ]);
    expect(board.island.map((player) => player.displayName).sort()).toEqual(
      [loser.displayName, absentee.displayName].sort(),
    );
    // History comes from the resolution documents and names players, never ids.
    expect(board.history).toHaveLength(1);
    expect(board.history[0]!.matchday).toBe(MATCHDAY);
    expect([...board.history[0]!.eliminated].sort()).toEqual(
      [loser.displayName, absentee.displayName].sort(),
    );

    // The shape is @penka/api's, not this worker's: drop the entry the worker
    // wrote and let the API build one from scratch. Anything the worker got
    // wrong — a missing field, a different current matchday, a stale history —
    // shows up as a difference here.
    await stack.redis.del(boardCacheKey(penka.id));
    expect(await getBoard(stack.player, penka.id)).toEqual(board);
  });

  it('applies a redelivered command exactly once', async () => {
    // THE test. RabbitMQ redelivers whenever an ack is lost, and a resolution
    // applied twice takes two lives off the same player for one matchday.
    stack = await startStack(infra, { redisDb: REDIS_DB });
    const { penka } = await seedFixture(stack, 'idempotent');

    await closeMatchday(stack.admin, MATCHDAY);
    await setAllResults(stack.admin, MATCHDAY);
    const snapshot = await snapshotEngineOutcome(stack.db, penka.id);

    await requestResolve(stack.admin, MATCHDAY);
    await awaitResolution(stack, penka.id);
    const settled = await entriesNow(stack.db, penka.id);
    const board = await eventually(async () => {
      const current = await cachedBoard(stack, penka.id);
      expect(current).not.toBeNull();
      return current!;
    });

    // The same message again, with the same messageId the publisher derives —
    // byte for byte what the broker sends after a lost ack.
    await broker.publishCommand(commandFor(penka));

    await eventually(async () => {
      expect(countLogged(stack, 'already-resolved')).toBe(1);
    });

    expect(await entriesNow(stack.db, penka.id)).toEqual(settled);
    expect(await resolutionsCollection(stack.db).countDocuments({ penkaId: penka.id })).toBe(1);
    expect(await cachedBoard(stack, penka.id)).toEqual(board);
    await expectStateMatchesOutcome(stack, penka.id, snapshot);
  });

  it('treats an already-resolved matchday as a no-op even without its marker', async () => {
    // The second idempotency layer. Deleting the marker is how a test reaches
    // the engine's own `already_resolved`: without it the gate would answer
    // first, and the layer under the gate would never be exercised.
    stack = await startStack(infra, { redisDb: REDIS_DB });
    const { penka } = await seedFixture(stack, 'engine-noop');

    await closeMatchday(stack.admin, MATCHDAY);
    await setAllResults(stack.admin, MATCHDAY);
    await requestResolve(stack.admin, MATCHDAY);
    await awaitResolution(stack, penka.id);
    const settled = await entriesNow(stack.db, penka.id);

    await resolutionsCollection(stack.db).deleteOne({ penkaId: penka.id, matchdayId: MATCHDAY_ID });
    await broker.publishCommand(commandFor(penka));

    await eventually(async () => {
      expect(countLogged(stack, 'the matchday is already resolved; nothing to apply')).toBe(1);
    });
    // No second elimination, and no marker invented for a matchday it did not
    // resolve: the message is acked and forgotten.
    expect(await entriesNow(stack.db, penka.id)).toEqual(settled);
    expect(await resolutionsCollection(stack.db).countDocuments({ penkaId: penka.id })).toBe(0);
  });

  it('never resolves a matchday that is still open for picks', async () => {
    // A resolve command that arrives before the close lands. The operator API
    // would refuse to publish this, so the test publishes it directly — the race
    // it stands for is a real one, and acking it would eliminate players who
    // could still change their pick.
    stack = await startStack(infra, { redisDb: REDIS_DB });
    const { penka } = await seedFixture(stack, 'race');
    const before = await entriesNow(stack.db, penka.id);

    await broker.publishCommand(commandFor(penka));

    const dead = await eventually(async () => {
      const messages = await broker.dlq();
      expect(messages).toHaveLength(1);
      return messages[0]!;
    });
    expect(dead.messageId).toBe(resolveMessageId(penka.id, MATCHDAY));
    expect(logMessages(stack)).toContain('not resolvable yet; asking for a retry');
    expect(stack.logs.some((line) => line['code'] === 'matchday_not_locked')).toBe(true);

    // Nothing was touched on the way to the dead-letter queue.
    expect(await entriesNow(stack.db, penka.id)).toEqual(before);
    expect(await resolutionsCollection(stack.db).countDocuments({ penkaId: penka.id })).toBe(0);
    expect(await matchdaysCollection(stack.db).findOne({ _id: MATCHDAY_ID })).toMatchObject({
      status: 'open',
    });
  });

  it('dead-letters a command after exactly three attempts', async () => {
    // Same limited-requeue path, a different race: the matchday is closed but an
    // operator has not finished loading results. Retrying is right — the result
    // may land in a second — but not forever.
    stack = await startStack(infra, { redisDb: REDIS_DB });
    const { penka, matches } = await seedFixture(stack, 'exhaustion');
    await closeMatchday(stack.admin, MATCHDAY);
    // Every match but the last one.
    for (const match of matches.slice(0, -1)) {
      await setResult(stack.admin, match.id, 'home');
    }

    await broker.publishCommand(commandFor(penka));

    const dead = await eventually(async () => {
      const messages = await broker.dlq();
      expect(messages).toHaveLength(1);
      return messages[0]!;
    });

    // Three deliveries: the original plus two counted retries. The header is the
    // counter, because a plain requeue carries none.
    expect(dead.headers[ATTEMPT_HEADER]).toBe(stack.config.maxAttempts);
    expect(countLogged(stack, 'retrying the command')).toBe(stack.config.maxAttempts - 1);
    expect(countLogged(stack, 'attempts exhausted; dead-lettering the command')).toBe(1);
    expect(stack.logs.some((line) => line['code'] === 'results_missing')).toBe(true);
    // x-death is the broker's own trail, written when it dead-letters — the part
    // an operator reads in the management console to see how it got here.
    expect(dead.headers['x-death']).toBeDefined();
    expect(await resolutionsCollection(stack.db).countDocuments({ penkaId: penka.id })).toBe(0);
  });

  it('resolves two penkas sharing one league calendar, each on its own settings', async () => {
    // Resolution fans out over the LEAGUE: one operator click, one command per
    // penka. They read the same matchday and the same results and must not see
    // each other's entries, picks, boards or settings.
    stack = await startStack(infra, { redisDb: REDIS_DB });
    const strict = await seedFixture(stack, 'strict', { lives: 1 });
    const forgiving = await seedFixture(stack, 'forgiving', { lives: 3 });

    await closeMatchday(stack.admin, MATCHDAY);
    await setAllResults(stack.admin, MATCHDAY);
    const strictSnapshot = await snapshotEngineOutcome(stack.db, strict.penka.id);
    const forgivingSnapshot = await snapshotEngineOutcome(stack.db, forgiving.penka.id);

    await requestResolve(stack.admin, MATCHDAY);
    await awaitResolution(stack, strict.penka.id);
    await awaitResolution(stack, forgiving.penka.id);

    await expectStateMatchesOutcome(stack, strict.penka.id, strictSnapshot);
    await expectStateMatchesOutcome(stack, forgiving.penka.id, forgivingSnapshot);
    // One life is the difference between elimination and a warning, on the same
    // fixtures and the same picks.
    expect(strictSnapshot.outcome.eliminatedEntryIds).toHaveLength(2);
    expect(forgivingSnapshot.outcome.eliminatedEntryIds).toHaveLength(0);

    // One marker each.
    expect(await resolutionsCollection(stack.db).countDocuments({ matchdayId: MATCHDAY_ID })).toBe(
      2,
    );

    // Cache coherence across the shared flip. Whichever penka resolves first
    // caches a board built while the matchday was still locked; when the last
    // one flips it, that board is dropped rather than left to expire. So no
    // cached board may still be sitting on the old matchday.
    await eventually(async () => {
      for (const penkaId of [strict.penka.id, forgiving.penka.id]) {
        const cached = await cachedBoard(stack, penkaId);
        if (cached !== null) {
          expect(cached.matchday).toBe(MATCHDAY + 1);
        }
      }
    });

    // Read them the way a player does — from the API, which rebuilds whatever
    // the flip dropped.
    const [strictBoard, forgivingBoard] = await Promise.all([
      getBoard(stack.player, strict.penka.id),
      getBoard(stack.player, forgiving.penka.id),
    ]);
    expect(strictBoard.matchday).toBe(MATCHDAY + 1);
    expect(forgivingBoard.matchday).toBe(MATCHDAY + 1);
    expect(strictBoard.alive.map((player) => player.displayName)).toEqual([
      strict.winner.displayName,
    ]);
    expect(strictBoard.island.map((player) => player.displayName).sort()).toEqual(
      [strict.loser.displayName, strict.absentee.displayName].sort(),
    );
    // Nobody went out here, so the history row is empty — but it exists, because
    // the matchday was resolved for this penka too.
    expect(forgivingBoard.island).toEqual([]);
    expect(forgivingBoard.history).toEqual([
      expect.objectContaining({ matchday: MATCHDAY, eliminated: [] }),
    ]);
    expect(forgivingBoard.alive.map((player) => player.lives).sort((a, b) => a - b)).toEqual([
      2, 2, 3,
    ]);

    // The league's matchday only advances once every penka on it is done.
    expect(await matchdaysCollection(stack.db).findOne({ _id: MATCHDAY_ID })).toMatchObject({
      status: 'resolved',
    });
  });

  it('resolves once when a crashed consumer sends an applied command back to the queue', async () => {
    // The exact failure the marker exists for: a worker applies a resolution and
    // dies before its ack reaches the broker, which then requeues the delivery.
    //
    // Reproduced without killing a process: the test's own channel takes the
    // operator's delivery and holds it unacked — that is the doomed worker. A
    // second copy of the same command (same messageId, what the publisher sends
    // when a confirm is lost) lets a live worker do the work meanwhile. Nacking
    // the held delivery afterwards is the crash, and what comes back is a
    // redelivery of a command whose effects are already durable.
    stack = await startStack(infra, { redisDb: REDIS_DB, withoutWorker: true });
    const { penka } = await seedFixture(stack, 'crash');

    await closeMatchday(stack.admin, MATCHDAY);
    await setAllResults(stack.admin, MATCHDAY);
    const snapshot = await snapshotEngineOutcome(stack.db, penka.id);
    await requestResolve(stack.admin, MATCHDAY);

    const held = await eventually(async () => {
      const message = await broker.channel.get(RESOLUTION_QUEUE, { noAck: false });
      expect(message).not.toBe(false);
      return message as Exclude<typeof message, false>;
    });
    expect(held.fields.redelivered).toBe(false);
    expect(held.properties.messageId).toBe(resolveMessageId(penka.id, MATCHDAY));

    await broker.publishCommand(commandFor(penka));
    await stack.startWorkerNow();
    await awaitResolution(stack, penka.id);
    const settled = await entriesNow(stack.db, penka.id);

    // The crash. The delivery goes back on the queue and the running worker
    // picks it up — with `redelivered` set and no attempt header, which must
    // read as a first attempt, not as a retry.
    broker.channel.nack(held, false, true);
    await eventually(async () => {
      expect(countLogged(stack, 'already-resolved')).toBe(1);
    });

    await expectStateMatchesOutcome(stack, penka.id, snapshot);
    expect(await entriesNow(stack.db, penka.id)).toEqual(settled);
    expect(await resolutionsCollection(stack.db).countDocuments({ penkaId: penka.id })).toBe(1);
    expect(countLogged(stack, 'retrying the command')).toBe(0);
    expect(await broker.dlq()).toEqual([]);
  });

  it('dead-letters a poison message and keeps consuming', async () => {
    // A body that will never parse and a body that parses into the wrong shape.
    // Neither improves on redelivery, so neither is retried — and neither may
    // take the queue down with it.
    stack = await startStack(infra, { redisDb: REDIS_DB });

    await broker.publishRaw('matchday.resolve.deadbeef', Buffer.from('{"penkaId":'), 'not-json');
    await broker.publishRaw(
      'matchday.resolve.deadbeef',
      Buffer.from(JSON.stringify({ penkaId: 42, matchday: 'one' })),
      'not-a-command',
    );

    await eventually(async () => {
      expect(countLogged(stack, 'poison message: not a resolution command')).toBe(2);
    });
    const dead = await eventually(async () => {
      const messages = await broker.dlq();
      expect(messages).toHaveLength(2);
      return messages;
    });
    expect(dead.map((message) => message.messageId).sort()).toEqual(['not-a-command', 'not-json']);
    // Straight to the dead-letter queue: no retry copy was ever published.
    expect(countLogged(stack, 'retrying the command')).toBe(0);

    // And the queue is still alive: a real matchday resolves right behind them.
    const { penka } = await seedFixture(stack, 'after-poison');
    await closeMatchday(stack.admin, MATCHDAY);
    await setAllResults(stack.admin, MATCHDAY);
    const snapshot = await snapshotEngineOutcome(stack.db, penka.id);
    await requestResolve(stack.admin, MATCHDAY);
    await awaitResolution(stack, penka.id);

    await expectStateMatchesOutcome(stack, penka.id, snapshot);
  });
});
