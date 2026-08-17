<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AdminKeyGate from './components/AdminKeyGate.vue';
import AppToast from './components/AppToast.vue';
import TopBar from './components/TopBar.vue';
import { useSessionStore } from './stores/session';

/**
 * The shell: the top bar, the routed screen and the toast.
 *
 * There is no poll loop here, unlike the player app. The back office reads on
 * demand — the operator is the one causing the changes — and the only automatic
 * re-read is the short watch after a resolve is queued, which belongs to the
 * matchday store because it is part of that write.
 */
const route = useRoute();
const session = useSessionStore();

/** The parity harness is a full-viewport screen; it frames its own chrome. */
const showChrome = computed(() => route.name !== 'parity');

/**
 * The gate replaces the routed screen rather than covering it: a console whose
 * every call is answered 401 has nothing to show, and leaving it mounted behind
 * a dialog would keep firing reads that cannot succeed.
 *
 * The parity harness is exempt — it frames a static prototype file and makes no
 * admin calls at all.
 */
const isLocked = computed(() => showChrome.value && session.isLocked);
</script>

<template>
  <div class="app">
    <TopBar v-if="showChrome" />
    <AdminKeyGate v-if="isLocked" />
    <RouterView v-else />
    <AppToast />
  </div>
</template>
