<script setup lang="ts">
import { computed } from 'vue';
import type { MatchdayStatus } from '@penka/contracts';
import { matchdayStatusLabel } from '../format/status';

const props = defineProps<{ status: MatchdayStatus }>();

const label = computed(() => matchdayStatusLabel(props.status));
</script>

<template>
  <span class="pill" :class="`pill--${status}`">{{ label }}</span>
</template>
