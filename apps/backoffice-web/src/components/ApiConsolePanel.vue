<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useConsoleStore } from '../stores/console';

const apiConsole = useConsoleStore();

// The client announces traffic whether or not anything is listening, so the
// panel subscribes while it is on screen and lets go when it leaves.
onMounted(() => {
  apiConsole.listen();
});
onUnmounted(() => {
  apiConsole.stopListening();
});
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Consola de API</h2>
      <span class="spacer"></span>
      <button class="btn btn--ghost btn--small" @click="apiConsole.clear()">Limpiar</button>
    </div>
    <div class="console">
      <div v-if="apiConsole.entries.length === 0" class="log-empty">Sin actividad todavía.</div>
      <div
        v-for="(entry, index) in apiConsole.entries"
        :key="`${entry.path}-${index}`"
        class="log-entry"
        :class="{ 'is-error': apiConsole.isFailure(entry) }"
      >
        <span class="log-method">{{ entry.method }}</span>
        <span class="log-path">
          {{ entry.path }}<template v-if="apiConsole.isFailure(entry) && entry.code">
            — {{ entry.code }}</template
          >
        </span>
        <span class="log-meta">{{ entry.status }} · {{ entry.ms }}ms</span>
      </div>
    </div>
  </section>
</template>
