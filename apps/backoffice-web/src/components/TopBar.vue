<script setup lang="ts">
import { computed } from 'vue';
import { PENKA_LOGO_DATA_URI } from '../assets/logo';
import { useMatchdayStore } from '../stores/matchday';
import { useSessionStore } from '../stores/session';

const matchday = useMatchdayStore();
const session = useSessionStore();

/**
 * The prototype showed `tournament.name · Fecha N`; the admin API sends no
 * league name — `GET /leagues/:leagueId/matchdays/:number` answers with the
 * matchday, its matches and the polling profile, nothing else. The league id is
 * what the operator addressed the console with, so that is what it shows.
 */
const context = computed(() =>
  matchday.matchday === null
    ? '—'
    : `${matchday.matchday.leagueId} · Fecha ${matchday.matchday.number}`,
);
</script>

<template>
  <header class="topbar">
    <img class="logo" :src="PENKA_LOGO_DATA_URI" alt="Penka" />
    <span class="divider"></span>
    <span class="product">Survivor · Back office</span>
    <span class="context">{{ context }}</span>
    <span class="spacer"></span>
    <!-- The prototype toggled between "mock backend" and "API real". This app
         has no mock: it only ever talks to @penka/backoffice-api. -->
    <span class="mode-pill">API real</span>
    <!-- Hidden while the gate is up: it is the way back TO the gate, and the
         gate is already there. -->
    <button v-if="!session.isLocked" class="key-button" type="button" @click="session.signOut()">
      Cambiar clave
    </button>
  </header>
</template>
