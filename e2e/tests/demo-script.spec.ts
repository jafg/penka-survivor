import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { type Match, type MatchOutcome, matchdayId } from '@penka/contracts';
import {
  type PlayerSession,
  closeAndResolve,
  closeMatchday,
  createPenka,
  getAdminMatchday,
  getBoard,
  getCurrentMatchday,
  getMyEntry,
  joinPenka,
  registerPlayer,
  resolveMatchday,
  setPollingProfile,
  setResult,
  submitPick,
} from '../support/api';
import { signInBrowser } from '../support/browser';

/**
 * The demo script, end to end, through the real stack: two players, a penka on
 * a catalog league, picks, the close-then-results-then-resolve operator flow,
 * an asynchronous resolution that travels through RabbitMQ into @penka/workers,
 * and the player app reading the result back.
 *
 * `copa-libertadores` is this spec's league and nothing else uses it: matchdays
 * are LEAGUE-scoped documents shared by every penka on them, so two specs on one
 * league would be closing each other's matchdays.
 */
const LEAGUE = 'copa-libertadores';

/**
 * Waiting on the board is waiting on the whole pipeline — publish, consume,
 * write, rebuild the cache — so it gets far longer than an assertion normally
 * would. The board is also cached for 60 seconds, which is the other half of
 * this number: a change an operator makes is visible once the cache turns over,
 * and the suite waits for that instead of deleting the key behind the app's back.
 */
const PIPELINE_TIMEOUT_MS = 120_000;
const BOARD_CACHE_TIMEOUT_MS = 90_000;

function at<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`${label}: expected an element at index ${index}, got ${items.length} items`);
  }
  return item;
}

/** A match this player can still back from the home side (no repeated teams). */
function pickableHome(matches: readonly Match[], usedTeams: readonly string[]): Match {
  const match = matches.find((candidate) => !usedTeams.includes(candidate.homeTeamCode));
  if (match === undefined) {
    throw new Error(`no home team left to pick; used ${usedTeams.join(',')}`);
  }
  return match;
}

/** Same, from the away side — which is the losing side once the result is `home`. */
function pickableAway(matches: readonly Match[], usedTeams: readonly string[]): Match {
  const match = matches.find((candidate) => !usedTeams.includes(candidate.awayTeamCode));
  if (match === undefined) {
    throw new Error(`no away team left to pick; used ${usedTeams.join(',')}`);
  }
  return match;
}

/**
 * Play one matchday: the winner backs a home team, the loser backs an away team,
 * the operator closes and loads results, and the resolution lands.
 *
 * Every match not named in the outcomes is a draw, which is neutral for anyone
 * who did not back one of its teams.
 */
async function playMatchday(
  request: APIRequestContext,
  penkaId: string,
  winner: PlayerSession,
  loser: PlayerSession,
  number: number,
): Promise<void> {
  const { matchday, matches } = await getCurrentMatchday(request, penkaId);
  expect(matchday.id, 'the calendar is derived, not invented').toBe(matchdayId(LEAGUE, number));
  expect(matchday.number).toBe(number);
  expect(matchday.status).toBe('open');

  const winnerMatch = pickableHome(matches, (await getMyEntry(request, winner, penkaId)).usedTeams);
  const loserMatch = pickableAway(matches, (await getMyEntry(request, loser, penkaId)).usedTeams);

  await submitPick(request, winner, penkaId, winnerMatch.homeTeamCode);
  await submitPick(request, loser, penkaId, loserMatch.awayTeamCode);

  // Both matches resolve `home`: the winner backed a home side and the loser an
  // away one, so one outcome per match settles both players either way.
  const outcomes = new Map<string, MatchOutcome>([
    [winnerMatch.id, 'home'],
    [loserMatch.id, 'home'],
  ]);
  const queued = await closeAndResolve(request, LEAGUE, number, outcomes);
  expect(queued, 'resolve is queued, never synchronous').toEqual({
    queued: true,
    matchdayId: matchdayId(LEAGUE, number),
  });

  // The admin view flips only when @penka/workers has resolved every penka on
  // the league — the completeness check in `finalizeMatchday`.
  await expect
    .poll(async () => (await getAdminMatchday(request, LEAGUE, number)).matchday.status, {
      timeout: PIPELINE_TIMEOUT_MS,
      intervals: [250, 500, 1_000, 2_000],
      message: `matchday ${number} never reached "resolved" — is @penka/workers running?`,
    })
    .toBe('resolved');

  // …and the public board follows when the worker rewrites its cache entry.
  await expect
    .poll(async () => (await getBoard(request, penkaId)).history.map((item) => item.matchday), {
      timeout: PIPELINE_TIMEOUT_MS,
      intervals: [250, 500, 1_000, 2_000],
    })
    .toContain(number);
}

test('a penka runs from creation to a resolved island, and the operator can slow the board down', async ({
  page,
  request,
}) => {
  const ana = await registerPlayer(request, 'Ana');
  const beto = await registerPlayer(request, 'Beto');

  const penka = await test.step('Ana creates a penka on a catalog league', async () => {
    const created = await createPenka(request, ana, 'Penka Demo', LEAGUE);
    // Four digits is the whole ceiling of the scheme, and the README says so.
    expect(created.joinCode).toMatch(/^\d{4}$/);
    // `settings: {}` on the way in becomes DEFAULT_PENKA_SETTINGS on the way out.
    expect(created.settings).toEqual({ lives: 2, islandEnabled: true });
    return created;
  });

  await test.step('Beto joins with the code, twice, and stays one entry', async () => {
    const joined = await joinPenka(request, beto, penka.joinCode);
    expect(joined.penka.id).toBe(penka.id);
    expect(joined.entry.lives).toBe(2);
    expect(joined.entry.status).toBe('alive');

    // Joining again is a 200 with the same entry, not a conflict: a player who
    // taps the button twice has not done anything wrong.
    const rejoined = await joinPenka(request, beto, penka.joinCode);
    expect(rejoined.entry.id).toBe(joined.entry.id);
  });

  await test.step('both submit a pick and the open board hides every one of them', async () => {
    const { matches } = await getCurrentMatchday(request, penka.id);
    const first = at(matches, 0, 'matchday 1 fixtures');
    await submitPick(request, ana, penka.id, first.homeTeamCode);
    await submitPick(request, beto, penka.id, first.awayTeamCode);

    const board = await getBoard(request, penka.id);
    expect(board.matchday).toBe(1);
    expect(board.isLocked).toBe(false);
    expect(board.isResolved).toBe(false);
    expect(board.alive).toHaveLength(2);
    expect(board.island).toHaveLength(0);
    // The board withholds picks until the matchday locks — for everyone,
    // including the player who made them.
    expect(board.alive.map((player) => player.pick)).toEqual([null, null]);
  });

  await test.step('the player app shows the same two rows with their picks hidden', async () => {
    await signInBrowser(page, ana);
    await page.goto(`/penkas/${penka.id}/standings`);

    const rows = page.locator('.standing-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('.player-name')).toHaveText(['Ana', 'Beto']);
    await expect(page.locator('.player-detail')).toHaveText(['Pick oculto', 'Pick oculto']);
  });

  await test.step('closing the matchday reveals the picks', async () => {
    const { matchday, matches } = await getCurrentMatchday(request, penka.id);
    const first = at(matches, 0, 'matchday 1 fixtures');
    expect(matchday.status, 'still open before the operator touches it').toBe('open');

    const locked = await closeMatchday(request, LEAGUE, 1);
    expect(locked.status).toBe('locked');

    // The board is cached for 60 seconds and closing does not invalidate it, so
    // the reveal arrives when the entry turns over rather than at the close.
    await expect
      .poll(async () => (await getBoard(request, penka.id)).alive.map((player) => player.pick), {
        timeout: BOARD_CACHE_TIMEOUT_MS,
        intervals: [1_000, 2_000],
        message: 'picks were never revealed after the close',
      })
      .toEqual([first.homeTeamCode, first.awayTeamCode]);
  });

  await test.step('the operator loads every result and asks for resolution', async () => {
    const { matches } = await getAdminMatchday(request, LEAGUE, 1);
    const first = at(matches, 0, 'matchday 1 fixtures');

    let pending = matches.length;
    for (const match of matches) {
      const outcome: MatchOutcome = match.id === first.id ? 'home' : 'draw';
      const response = await setResult(request, match.id, outcome);
      pending -= 1;
      expect(response.pendingMatches, 'the operator is told what is left').toBe(pending);
      // Locked AND complete is the only state resolve accepts, and the back
      // office greys its button out from this flag rather than re-deriving it.
      expect(response.readyToResolve).toBe(pending === 0);
    }

    const queued = await resolveMatchday(request, LEAGUE, 1);
    expect(queued).toEqual({ queued: true, matchdayId: matchdayId(LEAGUE, 1) });

    await expect
      .poll(async () => (await getAdminMatchday(request, LEAGUE, 1)).matchday.status, {
        timeout: PIPELINE_TIMEOUT_MS,
        intervals: [250, 500, 1_000, 2_000],
        message: 'matchday 1 never reached "resolved" — is @penka/workers running?',
      })
      .toBe('resolved');
  });

  await test.step('the resolution moved the right player and left the other intact', async () => {
    await expect
      .poll(async () => (await getBoard(request, penka.id)).history.map((item) => item.matchday), {
        timeout: PIPELINE_TIMEOUT_MS,
        intervals: [250, 500, 1_000, 2_000],
      })
      .toEqual([1]);

    const board = await getBoard(request, penka.id);
    // The board follows the calendar: matchday 1 is history now, and the open
    // matchday 2 is what players are being asked about.
    expect(board.matchday).toBe(2);
    expect(board.isResolved).toBe(false);
    expect(at(board.history, 0, 'history').eliminated).toEqual([]);

    expect(board.alive).toEqual([
      { displayName: 'Ana', lives: 2, points: 1, pick: null },
      { displayName: 'Beto', lives: 1, points: 0, pick: null },
    ]);
    expect(board.island).toHaveLength(0);

    // Alive players rank by lives, then points, then id — Beto lost a life, so
    // he is second whatever the order the entries were written in.
    expect(board.alive.map((player) => player.lives)).toEqual([2, 1]);
  });

  await test.step('a second matchday sends Beto to the island', async () => {
    // Two lives is the default, so one bad matchday cannot reach the island:
    // the demo needs the second one to make the island real rather than empty.
    await playMatchday(request, penka.id, ana, beto, 2);

    const board = await getBoard(request, penka.id);
    expect(board.alive).toEqual([{ displayName: 'Ana', lives: 2, points: 2, pick: null }]);
    expect(board.island).toEqual([{ displayName: 'Beto', lives: 0, points: 0, pick: null }]);
    // The matchday that knocked him out names him.
    expect(board.history.map((item) => item.matchday)).toEqual([1, 2]);
    expect(at(board.history, 1, 'history').eliminated).toEqual(['Beto']);

    // The island ranks by points, then id. Two players can only ever put one
    // person on it, so the assertion is the invariant rather than an order.
    const points = board.island.map((player) => player.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  await test.step('the player app shows the resolved standings', async () => {
    await page.goto(`/penkas/${penka.id}/standings`);

    const alive = page.locator('.standing-row:not(.is-island)');
    const island = page.locator('.standing-row.is-island');
    await expect(alive.locator('.player-name')).toHaveText(['Ana']);
    await expect(island.locator('.player-name')).toHaveText(['Beto']);
    // On the island the cards are gone and the points are the game.
    await expect(island.locator('.points.tnum')).toHaveText(['0']);
    // Both resolved matchdays are on the screen.
    await expect(page.locator('.history-row')).toHaveCount(2);
  });

  await test.step('the operator slows every board down and the app follows', async () => {
    // The profile is a deployment-wide load valve, not a per-penka setting.
    expect(await setPollingProfile(request, 'slow')).toBe('slow');

    // `normal` away from a lock is 10s and `slow` is 30s. The app arms its next
    // poll from the board's own `nextPollInSec`, so the indicator changes as
    // soon as a board built under the new profile reaches it — which is when
    // the 60-second cache entry turns over.
    await expect(page.locator('.poll-status')).toContainText('cada 30s', {
      timeout: BOARD_CACHE_TIMEOUT_MS,
    });
  });

  // Leave the deployment as it was found, so a demo that follows the suite is
  // not stuck on the slowest cadence.
  await setPollingProfile(request, 'normal');
});
