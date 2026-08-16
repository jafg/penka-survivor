<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { didTeamWin } from '@penka/game-engine';
import LockBar from '../components/LockBar.vue';
import MatchCard from '../components/MatchCard.vue';
import SkeletonList from '../components/SkeletonList.vue';
import { useCountdown } from '../composables/use-countdown';
import { validateMyPick } from '../game/pick';
import { useBoardStore } from '../stores/board';
import { useCatalogStore } from '../stores/catalog';
import { useMyEntryStore } from '../stores/my-entry';
import { usePenkasStore } from '../stores/penkas';
import { useToastStore } from '../stores/toast';

/**
 * The pick screen: one team per matchday, and everything that decides whether
 * it can still be chosen.
 *
 * Nothing on this screen decides a rule. Whether a team is choosable is
 * `validatePick`'s answer through `game/pick`, whether the matchday is shut is
 * `isMatchdayLocked`'s through the board store, and whether a resolved pick won
 * is `didTeamWin`'s — all of them the same functions the API runs. The view
 * arranges the answers; the engine gives them.
 */
const route = useRoute();
const router = useRouter();
const board = useBoardStore();
const myEntry = useMyEntryStore();
const penkas = usePenkasStore();
const catalog = useCatalogStore();
const toast = useToastStore();

/** What the player tapped but has not confirmed yet. */
const draftPick = ref<string | null>(null);

const penkaId = computed(() => String(route.params['penkaId'] ?? ''));
const item = computed(() => penkas.byId(penkaId.value) ?? null);
const settings = computed(() => item.value?.penka.settings ?? null);

const eyebrow = computed(() => {
  const penka = item.value?.penka;
  return penka === undefined ? 'Cargando…' : `${penka.name} · ${catalog.leagueName(penka.leagueId)}`;
});

const matchdayNumber = computed(() => board.matchday?.number ?? board.board?.matchday ?? null);

/**
 * The deadline drives a one-second clock, so the screen shuts itself the moment
 * it passes instead of staying open until the next poll answers.
 */
const { now, formatted } = useCountdown(() => board.matchday?.lockAt ?? board.board?.lockAt ?? null);
const isLocked = computed(() => board.isLockedAt(now.value));

const isLoading = computed(() => board.matches.length === 0);

/** The player's own pick, once they have one, otherwise what they just tapped. */
const selectedTeamCode = computed(() => draftPick.value ?? myEntry.myEntry?.myPick ?? null);
const usedTeams = computed(() => myEntry.myEntry?.usedTeams ?? []);

/**
 * A player on the island with the island switched OFF is out of the game for
 * good. With it ON they keep picking for points — the engine says so, and this
 * screen does not argue with it.
 */
const isIslandBlocked = computed(
  () => myEntry.myEntry?.status === 'island' && settings.value?.islandEnabled === false,
);

const notice = computed((): { tone: 'won' | 'lost'; title: string; detail: string } | null => {
  const entry = myEntry.myEntry;
  if (entry === null) {
    return null;
  }
  if (entry.status === 'island') {
    return {
      tone: 'lost',
      title: 'Te quedaste sin tarjetas',
      detail: 'Seguís jugando en La Isla: cada acierto suma 1 punto y entrás en su tabla.',
    };
  }
  if (board.board?.isResolved !== true || entry.myPick === null) {
    return null;
  }
  const teamName = catalog.teamName(entry.myPick);
  if (didTeamWin(board.matches, entry.myPick)) {
    return {
      tone: 'won',
      title: `${teamName} ganó`,
      detail: 'Pasás a la próxima fecha con tus tarjetas intactas.',
    };
  }
  return {
    tone: 'lost',
    title: `${teamName} no ganó`,
    detail: `Perdiste una tarjeta. Te ${entry.lives === 1 ? 'queda' : 'quedan'} ${entry.lives}.`,
  };
});

/**
 * Can this team be chosen right now? Asked per team, because the answer differs
 * per team: a spent one is refused while its neighbour is fine.
 *
 * Anything missing means "not yet" rather than "yes" — offering a pick before
 * the rule can be evaluated is how a screen ends up taking one the server
 * rejects.
 */
function isDisabled(teamCode: string): boolean {
  const entry = myEntry.myEntry;
  const matchday = board.matchday;
  const penkaSettings = settings.value;
  if (entry === null || matchday === null || penkaSettings === null) {
    return true;
  }
  if (myEntry.isSubmitting) {
    return true;
  }
  return !validateMyPick(
    { myEntry: entry, settings: penkaSettings, matchday, matches: board.matches, now: now.value },
    teamCode,
  ).ok;
}

/** The prototype's action-bar state machine, in its own words. */
const confirmLabel = computed(() => {
  const submitted = myEntry.myEntry?.myPick ?? null;
  if (isIslandBlocked.value) {
    return 'Jugás en La Isla';
  }
  if (isLocked.value) {
    return submitted === null ? 'Fecha cerrada sin pick' : `Elegiste ${catalog.teamName(submitted)}`;
  }
  const selected = selectedTeamCode.value;
  if (selected === null) {
    return 'Elegí un equipo';
  }
  if (selected === submitted) {
    return `Elegiste ${catalog.teamName(selected)}`;
  }
  return myEntry.isSubmitting ? 'Confirmando…' : `Confirmar ${catalog.teamName(selected)}`;
});

const canConfirm = computed(() => {
  const selected = selectedTeamCode.value;
  return (
    selected !== null &&
    selected !== (myEntry.myEntry?.myPick ?? null) &&
    !isLocked.value &&
    !isIslandBlocked.value &&
    !myEntry.isSubmitting
  );
});

function select(teamCode: string): void {
  draftPick.value = teamCode;
}

// A different penka means a different draft. Carrying one across would offer to
// confirm a team for a game the player is not looking at.
watch(penkaId, () => {
  draftPick.value = null;
});

async function confirm(): Promise<void> {
  const teamCode = selectedTeamCode.value;
  if (teamCode === null || !canConfirm.value) {
    return;
  }
  try {
    await myEntry.submitPick(teamCode);
    draftPick.value = null;
    toast.show(`Pick confirmado: ${catalog.teamName(teamCode)}`);
    await router.push({ name: 'standings', params: { penkaId: penkaId.value } });
  } catch {
    // The rejection is already in `myEntry.error`, in the API's own words —
    // most often the matchday locking between the tap and the request.
    toast.error(myEntry.error?.message ?? 'No pudimos confirmar tu pick. Probá de nuevo.');
  }
}
</script>

<template>
  <main class="screen">
    <div class="hero">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1 class="screen-title display">
        {{ matchdayNumber === null ? 'Fecha' : `Fecha ${matchdayNumber}` }}
      </h1>
    </div>
    <!--
      The 16px is the prototype's, inline and one-off there too: this intro is
      the only one that follows a hero, and it needs the extra air. Kept as an
      attribute rather than a new class so `base.css` stays the prototype's
      stylesheet verbatim.
    -->
    <p class="screen-intro" style="margin-top: 16px">
      Elegí un equipo que gane. Si empata o pierde, perdés una tarjeta. No podés repetir equipo en
      todo el torneo.
    </p>

    <LockBar :is-locked="isLocked" :countdown="formatted" />

    <div v-if="notice !== null" class="notice" :class="`notice--${notice.tone}`">
      <b>{{ notice.title }}</b
      >{{ notice.detail }}
    </div>

    <SkeletonList v-if="isLoading" />
    <template v-else>
      <MatchCard
        v-for="match in board.matches"
        :key="match.id"
        :match="match"
        :selected-team-code="selectedTeamCode"
        :used-teams="usedTeams"
        :is-disabled="isDisabled"
        @select="select"
      />
    </template>

    <div class="action-bar">
      <button class="btn" type="button" :disabled="!canConfirm" @click="confirm">
        {{ confirmLabel }}
      </button>
    </div>
  </main>
</template>
