import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AdminPoolSummary } from '@penka/contracts';
import { ApiError } from '../api/client';
import { listPools } from '../api/endpoints';
import { useToastStore } from './toast';

/** Which matchday the console opens on, when the listing knows enough to say. */
export interface MatchdaySelection {
  leagueId: string;
  number: number;
}

/**
 * The operator listing: every penka in the deployment with its counters.
 *
 * It also answers a question the admin API has no route for — "which matchday am
 * I working on?" — because `resolvedMatchdays` is a count, so the matchday after
 * the last resolved one is the live one. A wrong guess is cheap and visible: the
 * console shows the number it picked and the URL can override it.
 */
export const usePoolsStore = defineStore('pools', () => {
  const pools = ref<AdminPoolSummary[]>([]);

  /** Deployment-wide, the way the status panel reports it. */
  const picksReceived = computed(() =>
    pools.value.reduce((total, pool) => total + pool.picksReceived, 0),
  );

  /**
   * Taken from the first penka listed. With several leagues in play the operator
   * picks explicitly; this only decides where the console lands.
   */
  const suggestedSelection = computed<MatchdaySelection | null>(() => {
    const first = pools.value[0];
    if (first === undefined) {
      return null;
    }
    return { leagueId: first.penka.leagueId, number: first.resolvedMatchdays + 1 };
  });

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

  return { pools, picksReceived, suggestedSelection, load };
});
