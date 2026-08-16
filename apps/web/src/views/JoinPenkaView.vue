<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { usePenkasStore } from '../stores/penkas';

const router = useRouter();
const penkas = usePenkasStore();

const joinCode = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

/**
 * The only client-side gate is "not empty". Codes are four digits today, and the
 * input says so, but the route accepts any string up to 64 characters and
 * answers the SAME 404 for a malformed code as for an unknown one — deliberately,
 * so nobody can probe the format. Refusing "abc" here would leak exactly the
 * distinction the API is hiding, and would break the day codes grow a letter.
 */
const canSubmit = computed(() => joinCode.value.trim().length > 0 && !isSubmitting.value);

async function submit(): Promise<void> {
  if (!canSubmit.value) {
    return;
  }
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    const { penka } = await penkas.join(joinCode.value.trim());
    // 200 here also covers "you were already in this penka". That is a success:
    // the player wanted to be in, and they are.
    await router.push({ name: 'pick', params: { penkaId: penka.id } });
  } catch (caught) {
    errorMessage.value =
      caught instanceof ApiError ? caught.message : 'No pudimos sumarte. Probá de nuevo.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="screen">
    <div class="form-screen">
      <p class="eyebrow">Sumarme</p>
      <h1 class="screen-title display">Entrá con un código</h1>
      <p class="screen-intro">
        Cada Survivor vive dentro de una Penka privada. Pedile el código a quien la creó.
      </p>

      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

      <form @submit.prevent="submit">
        <label class="field">
          <span class="field-label">Código de la penka</span>
          <input
            v-model="joinCode"
            class="field-input field-input--code"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="0000"
            maxlength="64"
            :disabled="isSubmitting"
          />
        </label>

        <div class="form-actions">
          <button class="btn" type="submit" :disabled="!canSubmit">
            {{ isSubmitting ? 'Sumándote…' : 'Sumarme' }}
          </button>
          <RouterLink class="btn btn--ghost" :to="{ name: 'create-penka' }">
            Crear una penka
          </RouterLink>
        </div>
      </form>

      <p class="form-aside">
        <RouterLink :to="{ name: 'my-penkas' }">Volver a mis juegos</RouterLink>
      </p>
    </div>
  </main>
</template>
