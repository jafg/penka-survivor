<script setup lang="ts">
import { PENKA_LOGO_DATA_URI } from '../assets/logo';

/**
 * The fixed bar at the top: brand, product, and the poll indicator.
 *
 * The indicator says out loud that the cadence is the server's — "cada 10s"
 * comes from `nextPollInSec`, never from a constant here — and the pip blinks
 * while a request is in flight so a player can tell "nothing changed" from
 * "nothing loaded".
 */
const props = defineProps<{
  intervalSec: number | null;
  isFetching: boolean;
}>();
</script>

<template>
  <header class="app-header">
    <img class="logo" :src="PENKA_LOGO_DATA_URI" alt="Penka" />
    <span class="divider"></span>
    <span class="product">Survivor</span>
    <span class="spacer"></span>
    <span
      class="poll-status"
      :class="{ 'is-fetching': props.isFetching }"
      title="Intervalo de actualización definido por el servidor"
    >
      <span class="pip"></span>
      <span>{{ props.intervalSec === null ? '—' : `cada ${props.intervalSec}s` }}</span>
    </span>
  </header>
</template>
