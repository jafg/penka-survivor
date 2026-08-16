<script setup lang="ts">
import { computed } from 'vue';
import type { BoardHistoryItem } from '@penka/contracts';

/**
 * One resolved matchday in "Fechas anteriores".
 *
 * The prototype's mock handed the UI two finished strings, `headline` and
 * `detail`. The real board sends `eliminated: string[]` and lets the client
 * word it — which is the better split: the count and the names are data, the
 * sentence is copy, and copy that lives in the API cannot be changed without a
 * deploy of the API.
 */
const props = defineProps<{ item: BoardHistoryItem }>();

const count = computed(() => props.item.eliminated.length);

const headline = computed(() => {
  if (count.value === 0) {
    return 'No cayó nadie';
  }
  return count.value === 1 ? 'Cayó 1 jugador' : `Cayeron ${count.value} jugadores`;
});

/** Spanish joins the last name with "y", not with a comma. */
const detail = computed(() => {
  const names = props.item.eliminated;
  if (names.length === 0) {
    return 'Todos pasaron de fecha.';
  }
  if (names.length === 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1] ?? ''}`;
});
</script>

<template>
  <div class="history-row">
    <span class="history-matchday">Fecha {{ props.item.matchday }}</span>
    <span class="history-body">
      <span class="history-headline">{{ headline }}</span>
      <span class="history-detail">{{ detail }}</span>
    </span>
  </div>
</template>
