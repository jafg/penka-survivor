<script setup lang="ts">
import { computed } from 'vue';
import type { MatchdayStatus } from '@penka/contracts';

const props = defineProps<{ status: MatchdayStatus }>();

/** The prototype's three labels; the contract's three statuses. */
const LABELS: Record<MatchdayStatus, string> = {
  open: 'Abierta',
  locked: 'Cerrada',
  resolved: 'Resuelta',
};

const label = computed(() => LABELS[props.status]);
</script>

<template>
  <span class="pill" :class="`pill--${status}`">{{ label }}</span>
</template>
