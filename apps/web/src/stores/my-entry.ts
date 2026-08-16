import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { MyEntry } from '@penka/contracts';
import { ApiError } from '../api/client';
import { getMyEntry, submitPick as submitPickRequest } from '../api/endpoints';
import { useAuthStore } from './auth';

/**
 * PERSONAL penka data: this player's lives, status, pick and used teams.
 *
 * The counterpart to `boardStore`. Everything here is authenticated and private
 * — most of all `myPick`, which the public board deliberately withholds until
 * the matchday locks. Two stores rather than one is what makes that boundary
 * visible: a component reaching for a pick has to say whose it is.
 */
export const useMyEntryStore = defineStore('myEntry', () => {
  const penkaId = ref<string | null>(null);
  const myEntry = ref<MyEntry | null>(null);
  const isLoading = ref(false);
  const isSubmitting = ref(false);
  const error = ref<ApiError | null>(null);

  function remember(caught: unknown): ApiError {
    const failure =
      caught instanceof ApiError
        ? caught
        : new ApiError(0, 'internal', 'Algo salió mal. Probá de nuevo.');
    error.value = failure;
    return failure;
  }

  /** Point at a penka without fetching — see the note on `boardStore.select`. */
  function select(nextPenkaId: string | null): void {
    penkaId.value = nextPenkaId;
    myEntry.value = null;
    error.value = null;
  }

  async function open(nextPenkaId: string): Promise<void> {
    select(nextPenkaId);
    await refresh();
  }

  async function refresh(): Promise<void> {
    const id = penkaId.value;
    if (id === null) {
      return;
    }
    isLoading.value = true;
    try {
      const response = await getMyEntry(id);
      if (penkaId.value !== id) {
        return;
      }
      myEntry.value = response.myEntry;
      error.value = null;
    } catch (caught) {
      remember(caught);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Teams are named by catalog CODE on the wire, everywhere.
   *
   * The answer is the updated entry, so it is stored as-is: re-reading `/me`
   * afterwards would ask the server to repeat itself, and would leave the
   * pre-pick state on screen for the length of that round trip.
   */
  async function submitPick(teamCode: string): Promise<MyEntry> {
    const id = penkaId.value;
    if (id === null) {
      throw remember(new ApiError(0, 'internal', 'No hay ninguna penka abierta'));
    }
    isSubmitting.value = true;
    error.value = null;
    try {
      const response = await submitPickRequest(id, { teamCode });
      myEntry.value = response.myEntry;
      return response.myEntry;
    } catch (caught) {
      throw remember(caught);
    } finally {
      isSubmitting.value = false;
    }
  }

  /** A team is spent for the whole penka — the card renders struck through. */
  function isTeamUsed(teamCode: string): boolean {
    return myEntry.value?.usedTeams.includes(teamCode) ?? false;
  }

  const auth = useAuthStore();
  watch(
    () => auth.isAuthenticated,
    (isAuthenticated) => {
      if (!isAuthenticated) {
        // Personal data must not outlive its session — not on screen, and not
        // in memory for the next player to sign in on this device.
        penkaId.value = null;
        myEntry.value = null;
        error.value = null;
      }
    },
    { flush: 'sync' },
  );

  return {
    penkaId,
    myEntry,
    isLoading,
    isSubmitting,
    error,
    select,
    open,
    refresh,
    submitPick,
    isTeamUsed,
  };
});
