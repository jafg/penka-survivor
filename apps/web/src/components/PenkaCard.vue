<script setup lang="ts">
import { computed } from 'vue';
import type { MyPenkaItem } from '@penka/contracts';
import { useCatalogStore } from '../stores/catalog';

/**
 * One penka in "Mis Survivors".
 *
 * Every number on this card comes off `entry`, never off `penka`. The penka
 * says how many lives the competition hands out; the entry says how many THIS
 * player has left. Reading the wrong one shows two cards to someone down to
 * their last.
 */
const props = defineProps<{
  item: MyPenkaItem;
  isCurrent: boolean;
}>();

const emit = defineEmits<{ open: [penkaId: string] }>();

const catalog = useCatalogStore();

const onIsland = computed(() => props.item.entry.status === 'island');

const livesLabel = computed(() => {
  const lives = props.item.entry.lives;
  const verb = lives === 1 ? 'queda' : 'quedan';
  const noun = lives === 1 ? 'tarjeta' : 'tarjetas';
  return `te ${verb} ${lives} ${noun}`;
});
</script>

<template>
  <button
    type="button"
    class="pool-card"
    :class="{ 'is-current': props.isCurrent }"
    @click="emit('open', props.item.penka.id)"
  >
    <span class="pool-name">{{ props.item.penka.name }}</span>
    <span class="pool-meta">
      <span class="badge" :class="`badge--${props.item.entry.status}`">
        {{ onIsland ? 'En La Isla' : 'En carrera' }}
      </span>
      <!--
        The prototype also printed a player count and the current matchday here.
        Neither is on `MyPenkaItem`, and the listing route is not going to grow a
        per-penka board read just to fill a subtitle. The line keeps its rhythm
        with what the contract does carry.
      -->
      <span>{{ catalog.leagueName(props.item.penka.leagueId) }}</span>
    </span>
    <span class="pool-meta" style="margin-top: 7px">
      {{ onIsland ? 'jugás en La Isla' : livesLabel }}
    </span>
  </button>
</template>
