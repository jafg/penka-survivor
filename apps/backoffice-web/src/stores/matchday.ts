import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Match, Matchday, MatchOutcome } from '@penka/contracts';
import type { ResolveRejectionCode } from '@penka/game-engine';
import { ApiError } from '../api/client';
import {
  closeMatchday,
  getMatchday,
  listLeagueMatchdays,
  resolveMatchday as postResolve,
  setResult,
} from '../api/endpoints';
import { countPending, whyNotResolvable } from '../game/resolve';
import { useOpsStore } from './ops';
import { useToastStore } from './toast';

/**
 * The matchday the operator is working on, and the three writes that move it:
 * close, load a result, resolve.
 *
 * The order matters and the API enforces it — resolving an open matchday is a
 * 409 — so this store never decides for itself whether resolution would be
 * accepted. It asks `@penka/game-engine` through `whyNotResolvable`, which is the
 * same dry run the admin API runs.
 */

/**
 * How the console watches an asynchronous resolution. Resolve publishes one
 * message per penka and returns immediately, so the matchday's real status
 * arrives on a LATER read; these two numbers are how long the console is willing
 * to wait before handing the operator the refresh button instead of a spinner
 * that never ends.
 */
export const RESOLVE_POLL_MS = 2000;
export const RESOLVE_POLL_ATTEMPTS = 4;

export const useMatchdayStore = defineStore('matchday', () => {
  const leagueId = ref<string | null>(null);
  const number = ref<number | null>(null);

  /**
   * Every matchday the selected league actually has, from the API rather than
   * from arithmetic.
   *
   * The console used to derive the live matchday as "one after the last resolved
   * one", counted off the penka listing. That is right in the middle of a
   * competition and wrong at both ends: a league whose matchdays are all
   * resolved has no next one, so the console asked for a number that was never
   * materialized and showed `matchday_not_found` — an error no operator action
   * caused and none could clear. A number that came out of this list cannot do
   * that.
   */
  const calendar = ref<Matchday[]>([]);

  const matchday = ref<Matchday | null>(null);
  const matches = ref<Match[]>([]);

  /** A write is in flight: every control that could start another goes dead. */
  const isBusy = ref(false);
  /** Resolution has been queued and the console is still watching for its effect. */
  const isAwaitingResolution = ref(false);

  const isLoaded = computed(() => matchday.value !== null);
  const matchCount = computed(() => matches.value.length);
  const resultsLoaded = computed(() => matchCount.value - pendingMatches.value);
  const pendingMatches = computed(() => countPending(matches.value));
  const isResolved = computed(() => matchday.value?.status === 'resolved');

  /**
   * Why the API would refuse to resolve right now, straight from the engine —
   * `matchday_not_locked` while the matchday is open, `results_missing` while a
   * fixture has no outcome. The prototype keyed the button off the results alone
   * and would have offered a 409.
   */
  const resolveRejection = computed<ResolveRejectionCode | null>(() =>
    matchday.value === null ? 'matchday_not_locked' : whyNotResolvable(matchday.value, matches.value),
  );

  const canResolve = computed(
    () => !isBusy.value && !isAwaitingResolution.value && resolveRejection.value === null,
  );

  /**
   * Closing is about the matchday's STATUS, not about the clock: `lockAt` passing
   * stops picks, but only this write sets `status: 'locked'`, and only that
   * status lets resolution through.
   */
  const canClose = computed(() => !isBusy.value && matchday.value?.status === 'open');

  /** A resolved matchday answers 409 `already_resolved` to any further write. */
  const canLoadResults = computed(() => !isBusy.value && isLoaded.value && !isResolved.value);

  /** A league nobody has played has no calendar, so there is nothing to work on. */
  const hasCalendar = computed(() => calendar.value.length > 0);

  /** Every matchday resolved: the competition is over, not broken. */
  const isLeagueFinished = computed(
    () => hasCalendar.value && calendar.value.every((entry) => entry.status === 'resolved'),
  );

  const position = computed(() =>
    calendar.value.findIndex((entry) => entry.number === number.value),
  );
  const canGoPrevious = computed(() => position.value > 0);
  const canGoNext = computed(
    () => position.value >= 0 && position.value < calendar.value.length - 1,
  );

  function select(nextLeagueId: string, nextNumber: number): void {
    leagueId.value = nextLeagueId;
    number.value = nextNumber;
  }

  /**
   * Switches to a league: read its calendar, then open the matchday the operator
   * is most likely to want — the first one still unresolved, or the last one
   * when the league is finished.
   *
   * The order is the point. Nothing asks for a matchday until the API has said
   * which ones exist.
   */
  async function openLeague(nextLeagueId: string): Promise<void> {
    leagueId.value = nextLeagueId;
    number.value = null;
    calendar.value = [];
    matchday.value = null;
    matches.value = [];

    try {
      const response = await listLeagueMatchdays(nextLeagueId);
      calendar.value = response.matchdays;
    } catch (error) {
      report(error, 'No pudimos cargar el calendario');
      return;
    }

    const opening = calendar.value.find((entry) => entry.status !== 'resolved') ?? last();
    if (opening === undefined) {
      return;
    }
    number.value = opening.number;
    await load();
  }

  /**
   * Moves to another matchday of the SAME league. The number must be one the
   * calendar carries — that is what makes a 404 unreachable by navigation rather
   * than merely unlikely.
   */
  async function goTo(nextNumber: number): Promise<void> {
    if (!calendar.value.some((entry) => entry.number === nextNumber)) {
      return;
    }
    number.value = nextNumber;
    await load();
  }

  async function goPrevious(): Promise<void> {
    await step(-1);
  }

  async function goNext(): Promise<void> {
    await step(1);
  }

  async function step(delta: number): Promise<void> {
    const target = calendar.value[position.value + delta];
    if (target !== undefined) {
      await goTo(target.number);
    }
  }

  function last(): Matchday | undefined {
    return calendar.value[calendar.value.length - 1];
  }

  /**
   * Reads the matchday. Failures are reported and swallowed: every caller is a
   * click handler or a poll tick, and neither has anywhere to rethrow to.
   */
  async function load(): Promise<void> {
    const league = leagueId.value;
    const md = number.value;
    if (league === null || md === null) {
      return;
    }
    try {
      const detail = await getMatchday(league, md);
      matchday.value = detail.matchday;
      matches.value = detail.matches;
      syncCalendar(detail.matchday);
      const ops = useOpsStore();
      ops.observe(detail.pollingProfile);
      ops.stamp();
    } catch (error) {
      report(error, 'No pudimos cargar el estado');
    }
  }

  /** The manual way out of a slow resolution, wired to the refresh control. */
  async function refresh(): Promise<void> {
    await load();
  }

  async function close(): Promise<void> {
    const league = leagueId.value;
    const md = number.value;
    if (league === null || md === null) {
      return;
    }
    isBusy.value = true;
    try {
      const response = await closeMatchday(league, md);
      matchday.value = response.matchday;
      useToastStore().show('Fecha cerrada · no se aceptan más picks');
    } catch (error) {
      report(error, 'No pudimos cerrar la fecha');
    } finally {
      isBusy.value = false;
    }
  }

  /**
   * Writes one outcome. The response carries the written match and the API's own
   * pending count, which is the number the toast quotes: it counts across the
   * whole matchday, including rows this client has not re-read.
   */
  async function loadResult(matchId: string, outcome: MatchOutcome): Promise<void> {
    isBusy.value = true;
    try {
      const response = await setResult(matchId, { outcome });
      matches.value = matches.value.map((match) =>
        match.id === response.match.id ? response.match : match,
      );
      useToastStore().show(
        response.readyToResolve
          ? 'Resultado cargado · la fecha está lista para resolver'
          : `Resultado cargado · faltan ${response.pendingMatches}`,
      );
    } catch (error) {
      report(error, 'No pudimos cargar el resultado');
    } finally {
      isBusy.value = false;
    }
  }

  /**
   * Queues resolution. The endpoint returns as soon as the messages are
   * published, so the toast says QUEUED — the matchday is still `locked` here —
   * and the console then watches for the workers' effect.
   */
  async function resolve(): Promise<void> {
    const league = leagueId.value;
    const md = number.value;
    if (league === null || md === null) {
      return;
    }
    isBusy.value = true;
    try {
      await postResolve(league, md);
      useToastStore().show(
        'Resolución encolada · un job por Penka; el estado se actualiza al terminar',
      );
      isAwaitingResolution.value = true;
      void watchResolution();
    } catch (error) {
      report(error, 'No pudimos encolar la resolución');
    } finally {
      isBusy.value = false;
    }
  }

  /**
   * Re-reads the matchday a few times, stopping the moment the workers have
   * finished. When they are slower than the budget the console says so instead
   * of polling forever: the operator has a refresh button.
   */
  async function watchResolution(): Promise<void> {
    for (let attempt = 0; attempt < RESOLVE_POLL_ATTEMPTS; attempt += 1) {
      await wait(RESOLVE_POLL_MS);
      await load();
      if (isResolved.value) {
        isAwaitingResolution.value = false;
        return;
      }
    }
    isAwaitingResolution.value = false;
    useToastStore().show('La resolución sigue en curso · actualizá para ver el estado');
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Folds a freshly read matchday back into the calendar.
   *
   * Every read is a chance to learn that a status moved — a close the operator
   * just made, or a resolution the workers finished while the console watched.
   * Without this the picker would go on offering a resolved matchday as the live
   * one until someone reloaded the whole console.
   */
  function syncCalendar(fresh: Matchday): void {
    calendar.value = calendar.value.map((entry) => (entry.id === fresh.id ? fresh : entry));
  }

  /** Every API refusal reaches the operator in the API's own words. */
  function report(error: unknown, fallback: string): void {
    useToastStore().error(error instanceof ApiError ? error.message : fallback);
  }

  return {
    leagueId,
    number,
    calendar,
    matchday,
    matches,
    isBusy,
    isAwaitingResolution,
    isLoaded,
    hasCalendar,
    isLeagueFinished,
    canGoPrevious,
    canGoNext,
    matchCount,
    resultsLoaded,
    pendingMatches,
    isResolved,
    resolveRejection,
    canResolve,
    canClose,
    canLoadResults,
    select,
    openLeague,
    goTo,
    goPrevious,
    goNext,
    load,
    refresh,
    close,
    loadResult,
    resolve,
  };
});
