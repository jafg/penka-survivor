import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';
import type { Redis } from 'ioredis';
import type { ResolveMatchdayCommand } from '@penka/contracts';
import type { Entry, Match, Matchday, PlayerPick } from '@penka/contracts';
import { createResolutionHandler, type ResolutionSteps } from './handler';
import { captureLogs } from '../../test-support/logs';

const PENKA_ID = '6a80b60ffda322125df55e5f';
const ANA = '6a80b60ffda322125df55e60';
const MATCHDAY_ID = 'copa-libertadores:md1';
const NOW = new Date('2026-08-21T21:00:00.000Z');

const COMMAND: ResolveMatchdayCommand = {
  penkaId: PENKA_ID,
  leagueId: 'copa-libertadores',
  matchday: 1,
  requestedAt: '2026-08-21T20:59:00.000Z',
};

const MATCHDAY: Matchday = {
  id: MATCHDAY_ID,
  leagueId: 'copa-libertadores',
  number: 1,
  status: 'locked',
  lockAt: '2026-08-21T18:45:00.000Z',
};

const MATCHES: Match[] = [
  {
    id: 'copa-libertadores:md1:RIV-ATN',
    matchdayId: MATCHDAY_ID,
    homeTeamCode: 'RIV',
    awayTeamCode: 'ATN',
    kickoffAt: '2026-08-21T18:45:00.000Z',
    outcome: 'home',
  },
];

const ENTRIES: Entry[] = [
  { id: ANA, penkaId: PENKA_ID, userId: 'u1', lives: 2, status: 'alive', usedTeams: [], points: 0 },
];

const PICKS: PlayerPick[] = [
  {
    id: 'p1',
    entryId: ANA,
    matchdayId: MATCHDAY_ID,
    teamCode: 'RIV',
    createdAt: '2026-08-20T10:00:00.000Z',
  },
];

function makeSteps(overrides: Partial<ResolutionSteps> = {}) {
  const steps: ResolutionSteps = {
    hasResolution: vi.fn().mockResolvedValue(false),
    load: vi.fn().mockResolvedValue({
      matchday: MATCHDAY,
      matches: MATCHES,
      entries: ENTRIES,
      picks: PICKS,
      settings: { lives: 2, islandEnabled: true },
    }),
    apply: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue({ resolved: false, penkaIds: [] }),
    refresh: vi.fn().mockResolvedValue(null),
    dropBoards: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return steps;
}

function handlerWith(steps: ResolutionSteps, logs = captureLogs()) {
  const handle = createResolutionHandler({
    db: {} as Db,
    redis: {} as Redis,
    log: logs.logger,
    now: () => NOW,
    steps,
  });
  return { handle, logs };
}

describe('createResolutionHandler', () => {
  let steps: ResolutionSteps;

  beforeEach(() => {
    steps = makeSteps();
  });

  it('resolves a locked matchday with results in and reports what it applied', async () => {
    const { handle } = handlerWith(steps);

    const result = await handle(COMMAND);

    expect(result).toEqual({ status: 'applied', eliminated: 0 });
    expect(steps.apply).toHaveBeenCalledOnce();
  });

  it('applies exactly the outcome the engine returned for the loaded state', async () => {
    // The worker's whole contract with the engine: it passes the state through
    // and persists the answer. Anything it computed itself would be a second
    // implementation of the rules.
    const { handle } = handlerWith(steps);

    await handle(COMMAND);

    const input = vi.mocked(steps.apply).mock.calls[0]?.[0];
    expect(input?.outcome.matchdayId).toBe(MATCHDAY_ID);
    // RIV won at home and Ana backed RIV: one point, no life lost, team consumed.
    expect(input?.outcome.effects).toEqual([
      {
        entryId: ANA,
        livesDelta: 0,
        pointsDelta: 1,
        newLives: 2,
        newStatus: 'alive',
        teamConsumed: 'RIV',
      },
    ]);
    expect(input?.resolvedAt).toEqual(NOW);
  });

  it('does nothing at all when this penka already has a resolution for the matchday', async () => {
    // The gate. A redelivery must not eliminate anyone a second time, and the
    // cheapest way to know is to look for the marker the last run wrote.
    steps = makeSteps({ hasResolution: vi.fn().mockResolvedValue(true) });
    const { handle, logs } = handlerWith(steps);

    const result = await handle(COMMAND);

    expect(result).toEqual({ status: 'skipped', reason: 'already-resolved' });
    expect(steps.load).not.toHaveBeenCalled();
    expect(steps.apply).not.toHaveBeenCalled();
    expect(steps.refresh).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.lines)).toContain('already-resolved');
  });

  it('still tries to finish the shared matchday when it skips its own work', async () => {
    // Self-healing: if the run that applied this penka's resolution died before
    // flipping the league's matchday, the redelivery that finds the marker is
    // the one chance to finish the job.
    steps = makeSteps({ hasResolution: vi.fn().mockResolvedValue(true) });
    const { handle } = handlerWith(steps);

    await handle(COMMAND);

    expect(steps.finalize).toHaveBeenCalledOnce();
  });

  it('treats an already-resolved matchday as a no-op, not a failure', async () => {
    // The second idempotency layer: the marker can be missing while the shared
    // matchday says resolved. Requeueing would loop forever on a stable answer.
    steps = makeSteps({
      load: vi.fn().mockResolvedValue({
        matchday: { ...MATCHDAY, status: 'resolved' },
        matches: MATCHES,
        entries: ENTRIES,
        picks: PICKS,
        settings: { lives: 2, islandEnabled: true },
      }),
    });
    const { handle } = handlerWith(steps);

    expect(await handle(COMMAND)).toEqual({ status: 'skipped', reason: 'already_resolved' });
    expect(steps.apply).not.toHaveBeenCalled();
  });

  it('asks to be retried when the matchday is still open for picks', async () => {
    // A race with the back office, not a broken message: the close may land a
    // moment after the resolve command. Acking would drop the matchday on the
    // floor, so this goes back on the queue.
    steps = makeSteps({
      load: vi.fn().mockResolvedValue({
        matchday: { ...MATCHDAY, status: 'open' },
        matches: MATCHES,
        entries: ENTRIES,
        picks: PICKS,
        settings: { lives: 2, islandEnabled: true },
      }),
    });
    const { handle } = handlerWith(steps);

    expect(await handle(COMMAND)).toEqual({ status: 'retry', reason: 'matchday_not_locked' });
    expect(steps.apply).not.toHaveBeenCalled();
  });

  it('asks to be retried when a result has not been loaded yet', async () => {
    steps = makeSteps({
      load: vi.fn().mockResolvedValue({
        matchday: MATCHDAY,
        matches: [{ ...MATCHES[0], outcome: null }],
        entries: ENTRIES,
        picks: PICKS,
        settings: { lives: 2, islandEnabled: true },
      }),
    });
    const { handle } = handlerWith(steps);

    expect(await handle(COMMAND)).toEqual({ status: 'retry', reason: 'results_missing' });
  });

  it('skips a command whose penka or matchday is gone instead of retrying it', async () => {
    // No amount of redelivery brings a deleted penka back.
    steps = makeSteps({ load: vi.fn().mockResolvedValue(null) });
    const { handle, logs } = handlerWith(steps);

    expect(await handle(COMMAND)).toEqual({ status: 'skipped', reason: 'state-missing' });
    expect(JSON.stringify(logs.lines)).toContain(PENKA_ID);
  });

  it('rebuilds this penka board so the next poll sees the resolution', async () => {
    const { handle } = handlerWith(steps);

    await handle(COMMAND);

    expect(steps.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ penkaId: PENKA_ID, leagueId: 'copa-libertadores', now: NOW }),
    );
  });

  it('drops the sibling boards the shared flip just made stale', async () => {
    const siblings = [PENKA_ID, '6a80b60ffda322125df55e99'];
    steps = makeSteps({
      finalize: vi.fn().mockResolvedValue({ resolved: true, penkaIds: siblings }),
    });
    const { handle } = handlerWith(steps);

    await handle(COMMAND);

    expect(steps.dropBoards).toHaveBeenCalledWith(expect.anything(), siblings);
  });

  it('rebuilds its own board after the flip, not before it', async () => {
    // Otherwise this penka caches a board that still says the matchday is
    // locked, seconds after its own resolution made it resolved.
    const order: string[] = [];
    steps = makeSteps({
      finalize: vi.fn(async () => {
        order.push('finalize');
        return { resolved: true, penkaIds: [PENKA_ID] };
      }),
      dropBoards: vi.fn(async () => {
        order.push('drop');
      }),
      refresh: vi.fn(async () => {
        order.push('refresh');
        return null;
      }),
    });
    const { handle } = handlerWith(steps);

    await handle(COMMAND);

    expect(order).toEqual(['finalize', 'drop', 'refresh']);
  });

  it('passes the requested time through so the fan-out is counted correctly', async () => {
    const { handle } = handlerWith(steps);

    await handle(COMMAND);

    expect(steps.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        matchdayId: MATCHDAY_ID,
        leagueId: 'copa-libertadores',
        requestedAt: new Date(COMMAND.requestedAt),
      }),
    );
  });

  it('lets a failure to apply reach the caller so the message is retried', async () => {
    steps = makeSteps({ apply: vi.fn().mockRejectedValue(new Error('mongo is down')) });
    const { handle } = handlerWith(steps);

    await expect(handle(COMMAND)).rejects.toThrow('mongo is down');
  });

  it('reports the matchday as applied even if the board could not be refreshed', async () => {
    // The board is a cache with a TTL; the resolution is durable. Retrying the
    // whole message over a Redis blip would re-resolve a settled matchday.
    steps = makeSteps({ refresh: vi.fn().mockRejectedValue(new Error('redis is down')) });
    const { handle, logs } = handlerWith(steps);

    expect(await handle(COMMAND)).toEqual({ status: 'applied', eliminated: 0 });
    expect(JSON.stringify(logs.lines)).toContain('redis is down');
  });

  it('reports the matchday as applied even if the sibling boards could not be dropped', async () => {
    // Same Redis, same reasoning as the refresh above, and the stakes are higher
    // here: by this point the shared matchday has already flipped to resolved, so
    // a redelivery finds the marker, no-ops, and comes back to the same dead
    // Redis until the message reaches the DLQ — with every effect already durable.
    // A sibling board that survives the flip is stale for one TTL at worst.
    steps = makeSteps({
      finalize: vi.fn().mockResolvedValue({ resolved: true, penkaIds: ['penka-sibling'] }),
      dropBoards: vi.fn().mockRejectedValue(new Error('redis is down')),
    });
    const { handle, logs } = handlerWith(steps);

    expect(await handle(COMMAND)).toEqual({ status: 'applied', eliminated: 0 });
    expect(JSON.stringify(logs.lines)).toContain('redis is down');
    // And it still gets to rebuild its own board — the drop failing must not
    // take the step after it down with it.
    expect(steps.refresh).toHaveBeenCalled();
  });
});
