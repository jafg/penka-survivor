<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import AppToast from './components/AppToast.vue';
import TabBar from './components/TabBar.vue';
import { usePoll } from './composables/use-poll';
import { useAuthStore } from './stores/auth';
import { useBoardStore } from './stores/board';
import { useCatalogStore } from './stores/catalog';
import { useMyEntryStore } from './stores/my-entry';
import { usePenkasStore } from './stores/penkas';
import { useToastStore } from './stores/toast';

/**
 * The shell: chrome, and the single poll loop behind every penka screen.
 *
 * The loop lives here rather than in a view because "Mi pick" and "Tabla" are
 * two windows onto the same penka. One loop at the top means switching tabs does
 * not restart the cadence, and the header can show one honest indicator instead
 * of whichever view happens to be mounted.
 */
const route = useRoute();
const auth = useAuthStore();
const board = useBoardStore();
const myEntry = useMyEntryStore();
const penkas = usePenkasStore();
const catalog = useCatalogStore();
const toast = useToastStore();

/** The penka the current route is about, if it is about one. */
const penkaId = computed(() => {
  const raw = route.params['penkaId'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
});

const isParity = computed(() => route.name === 'parity');
const showChrome = computed(() => auth.isAuthenticated && !isParity.value);

/**
 * One tick: the public board, then the player's own row.
 *
 * Both, because resolution changes both — the standings move and the player's
 * lives drop in the same instant — and a screen that refreshed only the public
 * half would show someone else's elimination while still claiming they have two
 * cards.
 */
const poll = usePoll(async () => {
  const nextPollInSec = await board.refresh();
  if (auth.isAuthenticated) {
    await myEntry.refresh();
  }
  return nextPollInSec;
});
const { intervalSec, isFetching } = poll;

watch(
  penkaId,
  (id) => {
    // Always stop first: `start` is a no-op on a loop that is already running,
    // and switching penkas has to re-open with a fresh opening fetch.
    poll.stop();
    board.select(id);
    myEntry.select(id);
    if (id !== null) {
      // Select, then start: the loop's own opening fetch IS the load, so
      // opening a penka costs one round trip instead of two.
      poll.start();
    }
  },
  { immediate: true },
);

watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      void penkas.load();
      void catalog.loadLeagues();
    }
  },
  { immediate: true },
);

/**
 * Team names come from the catalog, and which catalog depends on the penka. The
 * game API only ever says "RIV".
 */
watch(
  () => (penkaId.value === null ? null : (penkas.byId(penkaId.value)?.penka.leagueId ?? null)),
  (leagueId) => {
    if (leagueId !== null) {
      void catalog.loadLeague(leagueId);
    }
  },
  { immediate: true },
);

/** A failed poll is announced, never rendered as an empty board. */
watch(
  () => board.error,
  (failure) => {
    if (failure !== null) {
      toast.error(failure.message);
    }
  },
);
</script>

<template>
  <div class="app">
    <AppHeader v-if="showChrome" :interval-sec="intervalSec" :is-fetching="isFetching" />

    <RouterView />

    <TabBar v-if="showChrome" :penka-id="penkaId" />
    <AppToast />
  </div>
</template>
