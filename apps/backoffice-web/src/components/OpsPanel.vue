<script setup lang="ts">
import { computed } from 'vue';
import type { PollingProfile } from '@penka/contracts';
import { ApiError } from '../api/client';
import { useMatchdayStore } from '../stores/matchday';
import { useOpsStore } from '../stores/ops';
import { useToastStore } from '../stores/toast';

const ops = useOpsStore();
const matchday = useMatchdayStore();
const toast = useToastStore();

/**
 * The prototype's three Spanish labels against the contract's three values.
 * "Degradado" is the label the operator knows; `degraded` is not a
 * `PollingProfile` — the contract calls that profile `slow` — so the label stays
 * and the value on the wire is the contract's.
 */
const PROFILES: { profile: PollingProfile; label: string }[] = [
  { profile: 'normal', label: 'Normal' },
  { profile: 'live', label: 'En vivo' },
  { profile: 'slow', label: 'Degradado' },
];

/**
 * The interval the deployment is serving. `PUT /polling-profile` answers with the
 * profile alone, so the seconds come from `nextPollInSec` in `@penka/contracts` —
 * the same function the public API runs — rather than from a table here.
 */
const interval = computed(() => {
  const seconds = ops.intervalSec(matchday.matchday?.lockAt ?? null);
  return seconds === null ? '—' : `${seconds} s`;
});

async function choose(profile: PollingProfile): Promise<void> {
  try {
    await ops.setProfile(profile);
    toast.show(`Polling: ${interval.value}`);
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'No pudimos cambiar el perfil');
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Operación</h2>
      <span class="hint">Polling</span>
    </div>
    <div class="panel-body">
      <div class="segmented">
        <button
          v-for="option in PROFILES"
          :key="option.profile"
          :class="{ 'is-selected': ops.profile === option.profile }"
          :disabled="ops.isBusy"
          :aria-pressed="ops.profile === option.profile"
          @click="choose(option.profile)"
        >
          {{ option.label }}
        </button>
      </div>
      <p class="field-note">
        El intervalo de polling lo define el servidor y viaja en cada respuesta. Cambiarlo acá
        afecta a las apps ya instaladas, sin esperar una release: <strong>en vivo</strong> refresca
        cada 2 s, <strong>degradado</strong> baja a 30 s como freno de carga.
      </p>
      <p class="field-note">
        Intervalo vigente: <strong class="tnum">{{ interval }}</strong>
      </p>
    </div>
  </section>
</template>
