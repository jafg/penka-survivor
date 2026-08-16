import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { JoinPenkaResponse, MyPenkaItem, Penka } from '@penka/contracts';
import { ApiError } from '../api/client';
import { createPenka, joinPenka, listMyPenkas } from '../api/endpoints';

export interface CreatePenkaInput {
  name: string;
  leagueId: string;
}

/**
 * The player's penkas: the listing, creating one, joining one.
 *
 * Each row is `{ penka, entry }` exactly as the route answers it, and it stays
 * that way. The penka is the competition — its name, its rules, the join code —
 * while the entry is *this player in it*: lives left, status, teams already
 * used. Flattening the two into one object is how a card ends up showing the
 * penka's configured lives to a player who has one left.
 */
export const usePenkasStore = defineStore('penkas', () => {
  const items = ref<MyPenkaItem[]>([]);
  const isLoading = ref(false);
  const error = ref<ApiError | null>(null);
  const hasLoaded = ref(false);

  function remember(caught: unknown): ApiError {
    const failure =
      caught instanceof ApiError
        ? caught
        : new ApiError(0, 'internal', 'Algo salió mal. Probá de nuevo.');
    error.value = failure;
    return failure;
  }

  /**
   * Never rejects. The listing is a screen, not an action: a failure belongs in
   * `error` where the view can offer a retry, not in a rejection every caller
   * would have to catch.
   */
  async function load(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      // The route answers newest-first. That ordering is the server's to make.
      items.value = (await listMyPenkas()).penkas;
      hasLoaded.value = true;
    } catch (caught) {
      remember(caught);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * `settings: {}` is deliberate and required: the field is mandatory while both
   * of its members are optional, which is the contract's way of saying "ask for
   * the defaults". Sending `{ lives: 2 }` would freeze today's default into the
   * bundle and break the day the API changes it.
   */
  async function create(input: CreatePenkaInput): Promise<Penka> {
    error.value = null;
    try {
      const response = await createPenka({ ...input, settings: {} });
      return response.penka;
    } catch (caught) {
      throw remember(caught);
    }
  }

  /**
   * Rejects, unlike `load` — the caller navigates on success and shows the
   * message on failure, so it needs to know which happened.
   *
   * A code that is already the player's answers 200 with the same entry. That
   * is success: anything else strands a player outside a penka they are in.
   */
  async function join(joinCode: string): Promise<JoinPenkaResponse> {
    error.value = null;
    try {
      const response = await joinPenka(joinCode);
      upsert({ penka: response.penka, entry: response.entry });
      return response;
    } catch (caught) {
      throw remember(caught);
    }
  }

  /** The join answer is a whole row, so the listing does not need re-fetching. */
  function upsert(item: MyPenkaItem): void {
    const index = items.value.findIndex((existing) => existing.penka.id === item.penka.id);
    if (index === -1) {
      items.value = [item, ...items.value];
      return;
    }
    items.value = items.value.map((existing, at) => (at === index ? item : existing));
  }

  function byId(penkaId: string): MyPenkaItem | undefined {
    return items.value.find((item) => item.penka.id === penkaId);
  }

  return { items, isLoading, error, hasLoaded, load, create, join, byId };
});
