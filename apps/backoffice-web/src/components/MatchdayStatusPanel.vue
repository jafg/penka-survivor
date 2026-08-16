<script setup lang="ts">
import { computed } from 'vue';
import { isMatchdayLocked } from '@penka/game-engine';
import { isResetAvailable, resetDemoData } from '../api/reset';
import { formatTime } from '../format/time';
import { useMatchdayStore } from '../stores/matchday';
import { useOpsStore } from '../stores/ops';
import { usePoolsStore } from '../stores/pools';
import { useToastStore } from '../stores/toast';
import StatusPill from './StatusPill.vue';

const matchday = useMatchdayStore();
const pools = usePoolsStore();
const ops = useOpsStore();
const toast = useToastStore();

/**
 * Whether PICKS are closed, which is a different question from whether the
 * matchday is closed: `lockAt` passing stops picks on its own, while only the
 * close write sets `status: 'locked'` — and only that status lets resolution
 * through. The engine answers the first question; the close button keys off the
 * second.
 */
const lockHint = computed(() => {
  const current = matchday.matchday;
  if (current === null) {
    return '—';
  }
  if (isMatchdayLocked(current, ops.clock)) {
    return 'Los picks están cerrados';
  }
  return `Cierra ${formatTime(current.lockAt)}`;
});

const resolveLabel = computed(() => {
  if (matchday.isResolved) {
    return 'Fecha resuelta';
  }
  return matchday.isAwaitingResolution ? 'Resolviendo…' : 'Resolver fecha';
});

/**
 * Why the resolve button is dead, in the operator's terms. The prototype had no
 * such line because it enabled the button on results alone; with the lock as a
 * precondition, a disabled button needs to say which half is missing.
 */
const resolveBlocker = computed(() => {
  if (matchday.isResolved || matchday.resolveRejection === null) {
    return null;
  }
  return matchday.resolveRejection === 'matchday_not_locked'
    ? 'Cerrá la fecha antes de resolverla.'
    : 'Cargá todos los resultados antes de resolver.';
});

async function refresh(): Promise<void> {
  await Promise.all([matchday.refresh(), pools.load()]);
}

async function reset(): Promise<void> {
  await resetDemoData();
  toast.show('Datos de prueba reiniciados');
  await refresh();
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Estado de la fecha</h2>
      <span class="spacer"></span>
      <span class="hint">{{ lockHint }}</span>
    </div>
    <div class="status-grid">
      <div class="status-cell">
        <span class="label">Fecha</span>
        <span class="value tnum">{{ matchday.matchday?.number ?? '—' }}</span>
      </div>
      <div class="status-cell">
        <span class="label">Estado</span>
        <span class="value small">
          <StatusPill v-if="matchday.matchday" :status="matchday.matchday.status" />
          <template v-else>—</template>
        </span>
      </div>
      <div class="status-cell">
        <span class="label">Resultados cargados</span>
        <span class="value tnum">
          {{ matchday.isLoaded ? `${matchday.resultsLoaded}/${matchday.matchCount}` : '—' }}
        </span>
      </div>
      <div class="status-cell">
        <span class="label">Picks recibidos</span>
        <span class="value tnum">{{ pools.picksReceived }}</span>
      </div>
    </div>
    <div class="panel-body panel-body--divided">
      <div class="btn-row">
        <button class="btn btn--ghost" :disabled="!matchday.canClose" @click="matchday.close()">
          Cerrar fecha
        </button>
        <button class="btn" :disabled="!matchday.canResolve" @click="matchday.resolve()">
          {{ resolveLabel }}
        </button>
        <!-- Not in the prototype: resolution is asynchronous, so the console
             offers a way to ask again once the workers have run. -->
        <button class="btn btn--ghost" :disabled="matchday.isBusy" @click="refresh">
          Actualizar
        </button>
        <button
          v-if="isResetAvailable"
          class="btn btn--danger btn--trailing"
          :disabled="matchday.isBusy"
          @click="reset"
        >
          Reiniciar datos de prueba
        </button>
      </div>
      <p class="field-note">
        Cerrar la fecha bloquea nuevos picks. Resolver encola un job por Penka: idempotente y
        particionado, de modo que reintentarlo no altera el resultado.
        <strong v-if="resolveBlocker">{{ resolveBlocker }}</strong>
      </p>
    </div>
  </section>
</template>
