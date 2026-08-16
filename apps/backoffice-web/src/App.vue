<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppToast from './components/AppToast.vue';
import TopBar from './components/TopBar.vue';

/**
 * The shell: the top bar, the routed screen and the toast.
 *
 * There is no poll loop here, unlike the player app. The back office reads on
 * demand — the operator is the one causing the changes — and the only automatic
 * re-read is the short watch after a resolve is queued, which belongs to the
 * matchday store because it is part of that write.
 */
const route = useRoute();

/** The parity harness is a full-viewport screen; it frames its own chrome. */
const showChrome = computed(() => route.name !== 'parity');
</script>

<template>
  <div class="app">
    <TopBar v-if="showChrome" />
    <RouterView />
    <AppToast />
  </div>
</template>
