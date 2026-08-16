<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { useCatalogStore } from '../stores/catalog';
import { usePenkasStore } from '../stores/penkas';
import { useToastStore } from '../stores/toast';

const router = useRouter();
const catalog = useCatalogStore();
const penkas = usePenkasStore();
const toast = useToastStore();

const name = ref('');
const leagueId = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

onMounted(async () => {
  await catalog.loadLeagues();
  leagueId.value = catalog.leagues[0]?.id ?? '';
});

const canSubmit = computed(
  () => name.value.trim().length > 0 && leagueId.value.length > 0 && !isSubmitting.value,
);

async function submit(): Promise<void> {
  if (!canSubmit.value) {
    return;
  }
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    // No settings are collected: `penkasStore.create` sends `settings: {}` and
    // the server fills in its own defaults. The number of lives is the API's
    // decision, not a constant in this bundle.
    const penka = await penkas.create({ name: name.value.trim(), leagueId: leagueId.value });
    toast.show(`Penka creada. El código es ${penka.joinCode}`);
    await router.push({ name: 'pick', params: { penkaId: penka.id } });
  } catch (caught) {
    errorMessage.value =
      caught instanceof ApiError ? caught.message : 'No pudimos crear la penka. Probá de nuevo.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="screen">
    <div class="form-screen">
      <p class="eyebrow">Armar el grupo</p>
      <h1 class="screen-title display">Crear una penka</h1>
      <p class="screen-intro">
        Elegí el torneo y ponele un nombre. Después pasás el código y se suman los demás.
      </p>

      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

      <form @submit.prevent="submit">
        <label class="field">
          <span class="field-label">Nombre</span>
          <input
            v-model="name"
            class="field-input"
            type="text"
            placeholder="Survivor de la oficina"
            required
            :disabled="isSubmitting"
          />
        </label>

        <label class="field">
          <span class="field-label">Torneo</span>
          <select v-model="leagueId" class="field-input" :disabled="isSubmitting">
            <option v-for="league in catalog.leagues" :key="league.id" :value="league.id">
              {{ league.name }}
            </option>
          </select>
        </label>

        <div class="form-actions">
          <button class="btn" type="submit" :disabled="!canSubmit">
            {{ isSubmitting ? 'Creando…' : 'Crear penka' }}
          </button>
        </div>
      </form>

      <p class="form-aside">
        <RouterLink :to="{ name: 'my-penkas' }">Volver a mis juegos</RouterLink>
      </p>
    </div>
  </main>
</template>
