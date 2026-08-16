<script setup lang="ts">
import { computed } from 'vue';
import type { BoardPlayer } from '@penka/contracts';
import { useCatalogStore } from '../stores/catalog';
import LifeCards from './LifeCards.vue';

/**
 * One line of the standings.
 *
 * The board deliberately carries no viewer identity — it is the same bytes for
 * everyone — so `isMe` is the caller's conclusion, reached by matching the
 * signed-in display name.
 */
const props = defineProps<{
  player: BoardPlayer;
  rank: number;
  isLocked: boolean;
  isMe: boolean;
  onIsland: boolean;
  livesTotal: number;
}>();

const catalog = useCatalogStore();

/**
 * A null pick means two opposite things either side of the lock.
 *
 * Before it, the server is withholding a pick that exists — every player reads
 * "Pick oculto" and nobody can scout the room. After it, picks are public, so a
 * null is the real thing: this player did not pick at all. The schema cannot
 * tell those apart, which is exactly why the lock has to be read here.
 */
const pickLabel = computed(() => {
  if (props.player.pick !== null) {
    return catalog.teamName(props.player.pick);
  }
  return props.isLocked ? 'Sin pick' : 'Pick oculto';
});
</script>

<template>
  <div class="standing-row" :class="{ 'is-me': props.isMe, 'is-island': props.onIsland }">
    <span class="rank tnum">{{ props.rank }}</span>
    <span class="player">
      <span class="player-name">{{ props.player.displayName }}</span>
      <span class="player-detail">{{ pickLabel }}</span>
    </span>
    <span class="trailing">
      <!-- On the island there are no cards left to show; the points are the game. -->
      <span v-if="props.onIsland" class="points tnum">{{ props.player.points }}</span>
      <LifeCards v-else :lives="props.player.lives" :total="props.livesTotal" />
    </span>
  </div>
</template>
