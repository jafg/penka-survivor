<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import EmptyState from '../components/EmptyState.vue';
import HistoryRow from '../components/HistoryRow.vue';
import SkeletonList from '../components/SkeletonList.vue';
import StandingRow from '../components/StandingRow.vue';
import { useCountdown } from '../composables/use-countdown';
import { useAuthStore } from '../stores/auth';
import { useBoardStore } from '../stores/board';
import { usePenkasStore } from '../stores/penkas';

/**
 * The public table: who is still in, who is on the island, and what happened on
 * the matchdays already resolved.
 *
 * Everything on this screen is the board exactly as the server built it. In
 * particular the order is not touched: `computeStandings` in
 * `@penka/game-engine` ranks both lists, and re-sorting them here would be a
 * second opinion about who is winning.
 */
const route = useRoute();
const auth = useAuthStore();
const board = useBoardStore();
const penkas = usePenkasStore();

const penkaId = computed(() => String(route.params['penkaId'] ?? ''));
const item = computed(() => penkas.byId(penkaId.value) ?? null);
const livesTotal = computed(() => item.value?.penka.settings.lives ?? 0);

const { now } = useCountdown(() => board.matchday?.lockAt ?? board.board?.lockAt ?? null);
const isLocked = computed(() => board.isLockedAt(now.value));

const alive = computed(() => board.board?.alive ?? []);
const island = computed(() => board.board?.island ?? []);
const history = computed(() => board.board?.history ?? []);

/**
 * Everyone who is still in the penka, one way or the other. The board sends the
 * two lists rather than a total, and the sum is a count for a caption — not a
 * standing, which is why it can be added up here.
 */
const totalPlayers = computed(() => alive.value.length + island.value.length);

const summary = computed(() => {
  const current = board.board;
  if (current === null) {
    return '';
  }
  const state = current.isResolved ? 'resuelta' : 'en juego';
  return `${totalPlayers.value} jugadores · Fecha ${current.matchday} ${state}`;
});

/**
 * The board carries no viewer identity — it is the same bytes for every player,
 * which is what lets it be cached — so the row is matched by display name.
 */
function isMe(displayName: string): boolean {
  return auth.user?.displayName === displayName;
}
</script>

<template>
  <main class="screen">
    <p class="eyebrow">{{ item?.penka.name ?? '' }}</p>
    <h1 class="screen-title display">Tabla</h1>
    <p class="screen-intro">{{ summary }}</p>

    <SkeletonList v-if="board.board === null" />

    <template v-else>
      <div class="section-head">
        <h2>En carrera</h2>
        <span class="tally">{{ alive.length }} de {{ totalPlayers }}</span>
      </div>
      <StandingRow
        v-for="(player, index) in alive"
        :key="player.displayName"
        :player="player"
        :rank="index + 1"
        :is-locked="isLocked"
        :is-me="isMe(player.displayName)"
        :on-island="false"
        :lives-total="livesTotal"
      />

      <div class="section-head">
        <h2>La Isla</h2>
        <span class="tally">{{ island.length }}</span>
      </div>
      <!-- The prototype pulls this one up by 4px, inline: it sits directly
           under a section head rather than under a title. -->
      <p class="screen-intro" style="margin-top: -4px">
        Sin tarjetas, pero siguen jugando: 1 punto por acierto.
      </p>

      <!--
        The prototype said "sus dos tarjetas" because its mock only ever dealt
        two. A penka is created with one to three, so the number comes from its
        settings and reads exactly as the prototype does in the common case.
      -->
      <EmptyState
        v-if="island.length === 0"
        title="La Isla está vacía"
        :detail="`Todavía nadie perdió sus ${livesTotal} tarjetas.`"
      />
      <StandingRow
        v-for="(player, index) in island"
        :key="player.displayName"
        :player="player"
        :rank="index + 1"
        :is-locked="isLocked"
        :is-me="isMe(player.displayName)"
        :on-island="true"
        :lives-total="livesTotal"
      />

      <div class="section-head"><h2>Fechas anteriores</h2></div>
      <EmptyState
        v-if="history.length === 0"
        title="Todavía no hay fechas resueltas"
        detail="Acá vas a ver quién cayó en cada fecha."
      />
      <HistoryRow v-for="entry in history" :key="entry.matchday" :item="entry" />
    </template>
  </main>
</template>
