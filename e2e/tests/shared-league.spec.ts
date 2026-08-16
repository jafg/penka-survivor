import { expect, test } from '@playwright/test';
import { type MatchOutcome, matchdayId } from '@penka/contracts';
import {
  closeAndResolve,
  createPenka,
  getAdminMatchday,
  getBoard,
  getCurrentMatchday,
  registerPlayer,
  submitPick,
} from '../support/api';

/**
 * Two penkas on ONE league, resolved by ONE admin action.
 *
 * This is the shape the whole calendar design turns on: matchdays and matches
 * belong to a league, not to a penka, so two penkas share the same documents and
 * the same lock instant — while lives, picks and standings stay strictly
 * per-penka. The operator closes and resolves the league's matchday once, and
 * the back-office API fans one command out per penka onto `survivor.commands`,
 * where @penka/workers resolves each independently.
 *
 * No browser here: the fan-out is a server property, and the demo spec already
 * covers what the player app does with the result.
 */
const LEAGUE = 'champions-league';

const PIPELINE_TIMEOUT_MS = 120_000;

test('one admin action resolves every penka on the league, each on its own terms', async ({
  request,
}) => {
  const caro = await registerPlayer(request, 'Caro');
  const dami = await registerPlayer(request, 'Dami');

  // Both penkas exist before the resolve is requested, which is what puts them
  // both in its fan-out: the API selects `{ leagueId, createdAt <= requestedAt }`.
  const first = await createPenka(request, caro, 'Penka Uno', LEAGUE);
  const second = await createPenka(request, dami, 'Penka Dos', LEAGUE);
  expect(second.id).not.toBe(first.id);
  expect(second.joinCode).not.toBe(first.joinCode);

  const firstMatchday = await getCurrentMatchday(request, first.id);
  const secondMatchday = await getCurrentMatchday(request, second.id);

  await test.step('the two penkas look at the same calendar', async () => {
    expect(firstMatchday.matchday.id).toBe(matchdayId(LEAGUE, 1));
    // Same document, so the same id, the same lock instant and the same
    // fixtures — the second penka did not materialize a calendar of its own.
    expect(secondMatchday.matchday).toEqual(firstMatchday.matchday);
    expect(secondMatchday.matches).toEqual(firstMatchday.matches);
  });

  const fixture = firstMatchday.matches[0];
  if (fixture === undefined) {
    throw new Error(`${LEAGUE} matchday 1 has no fixtures`);
  }

  // Caro backs the home side in her penka, Dami the away side in his: one result
  // sends the two penkas in opposite directions.
  await submitPick(request, caro, first.id, fixture.homeTeamCode);
  await submitPick(request, dami, second.id, fixture.awayTeamCode);

  const queued = await test.step('one close, one set of results, one resolve', async () => {
    const outcomes = new Map<string, MatchOutcome>([[fixture.id, 'home']]);
    return closeAndResolve(request, LEAGUE, 1, outcomes);
  });
  expect(queued).toEqual({ queued: true, matchdayId: matchdayId(LEAGUE, 1) });

  await test.step('both penkas resolve, independently', async () => {
    for (const penkaId of [first.id, second.id]) {
      await expect
        .poll(async () => (await getBoard(request, penkaId)).history.map((item) => item.matchday), {
          timeout: PIPELINE_TIMEOUT_MS,
          intervals: [250, 500, 1_000, 2_000],
          message: `penka ${penkaId} never got its matchday 1 row — is @penka/workers running?`,
        })
        .toEqual([1]);
    }

    const winnerBoard = await getBoard(request, first.id);
    expect(winnerBoard.alive).toEqual([
      { displayName: 'Caro', lives: 2, points: 1, pick: null },
    ]);
    expect(winnerBoard.island).toHaveLength(0);

    const loserBoard = await getBoard(request, second.id);
    expect(loserBoard.alive).toEqual([{ displayName: 'Dami', lives: 1, points: 0, pick: null }]);
    // One life left, so nobody is on the island yet and nobody was eliminated.
    expect(loserBoard.island).toHaveLength(0);
    expect(loserBoard.history.flatMap((item) => item.eliminated)).toEqual([]);
  });

  await test.step('the matchday flips only once both are done', async () => {
    const { matchday } = await getAdminMatchday(request, LEAGUE, 1);
    // `finalizeMatchday` waits for a resolution document from EVERY penka on the
    // league before flipping the shared matchday — otherwise the second penka
    // would find its calendar already resolved and never get its own row.
    expect(matchday.status).toBe('resolved');
  });
});
