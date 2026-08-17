import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AdminPoolSummary } from '@penka/contracts';
import { ApiError } from '../api/client';
import { listPools } from '../api/endpoints';
import { useToastStore } from './toast';

/**
 * The operator listing: every penka in the deployment with its counters.
 *
 * It also answers which LEAGUES are worth showing, since the admin API has no
 * route for that — a league matters to an operator exactly when a penka is being
 * played on it. It deliberately does not answer which MATCHDAY: it used to, as
 * `resolvedMatchdays + 1`, and that arithmetic walks off the end of a finished
 * league and asks for a matchday that was never materialized. The numbers come
 * from the league's own calendar now (`stores/matchday.ts`).
 */
export const usePoolsStore = defineStore('pools', () => {
  const pools = ref<AdminPoolSummary[]>([]);

  /** Deployment-wide, the way the status panel reports it. */
  const picksReceived = computed(() =>
    pools.value.reduce((total, pool) => total + pool.picksReceived, 0),
  );

  /**
   * Every league with at least one penka on it, deduped, in listing order — the
   * league switcher's whole source of truth. Not the catalog: a league nobody
   * plays has no calendar and nothing for an operator to do.
   */
  const leaguesInPlay = computed(() => [
    ...new Set(pools.value.map((pool) => pool.penka.leagueId)),
  ]);

  /**
   * Where the console lands: the first penka's league. With several leagues in
   * play the operator switches explicitly.
   */
  const suggestedLeagueId = computed<string | null>(() => leaguesInPlay.value[0] ?? null);

  async function load(): Promise<void> {
    try {
      const response = await listPools();
      pools.value = response.pools;
    } catch (error) {
      useToastStore().error(
        error instanceof ApiError ? error.message : 'No pudimos cargar las penkas',
      );
    }
  }

  return { pools, picksReceived, leaguesInPlay, suggestedLeagueId, load };
});
