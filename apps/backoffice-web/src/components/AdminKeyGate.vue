<script setup lang="ts">
import { ref } from 'vue';
import { useSessionStore } from '../stores/session';

/**
 * The screen an operator gets instead of a dead console.
 *
 * Before this, a key the deployment did not know left the dashboard mounted and
 * empty, with the 401 visible only in the API log panel and nothing on screen to
 * do about it. This is not a login: there is no identity behind the shared
 * secret, so it asks for the key, tries it, and keeps it only if the API says yes.
 */
const session = useSessionStore();

const key = ref('');
const isSubmitting = ref(false);

/**
 * The dev fallback the console is built with (`VITE_ADMIN_API_KEY`), offered as
 * one click so a fresh clone or a demo never has to go looking for it.
 * `import.meta.env.DEV` is a literal after Vite's replacement, so a production
 * build folds this to `''` and drops the button.
 */
const devKey = import.meta.env.DEV ? (import.meta.env.VITE_ADMIN_API_KEY ?? '') : '';

async function submit(candidate: string): Promise<void> {
  if (isSubmitting.value) {
    return;
  }
  isSubmitting.value = true;
  try {
    const accepted = await session.signIn(candidate);
    if (accepted) {
      // Not kept around after it worked — it lives in localStorage now, and a
      // component holding the deployment's secret in reactive state is one more
      // place it can be read from.
      key.value = '';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="gate">
    <div class="gate-card">
      <h1 class="gate-title">Clave de administración</h1>
      <p class="gate-intro">
        La consola manda una clave compartida en cada pedido. El servidor la rechazó, o
        todavía no hay ninguna cargada.
      </p>

      <p v-if="session.errorMessage" class="gate-error" role="alert">
        {{ session.errorMessage }}
      </p>

      <form @submit.prevent="submit(key)">
        <label class="field">
          <span class="field-label">Clave</span>
          <input
            v-model="key"
            class="field-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :disabled="isSubmitting"
          />
        </label>

        <div class="gate-actions">
          <button class="btn" type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Probando…' : 'Entrar' }}
          </button>
          <button
            v-if="devKey !== ''"
            class="btn btn--ghost"
            type="button"
            :disabled="isSubmitting"
            @click="submit(devKey)"
          >
            Usar la clave de desarrollo
          </button>
        </div>
      </form>

      <p class="gate-aside">
        Es la misma que <code>ADMIN_API_KEY</code> en el entorno de
        <code>@penka/backoffice-api</code>. Queda guardada en este navegador.
      </p>
    </div>
  </main>
</template>
