<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

async function submit(): Promise<void> {
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    await auth.login(email.value, password.value);
    // Back to wherever the guard interrupted them, or to their penkas.
    const redirect = route.query['redirect'];
    await router.replace(typeof redirect === 'string' ? redirect : { name: 'my-penkas' });
  } catch (caught) {
    // The API's own wording, including the shared 10/min rate limit it applies
    // across sign-in and join. Rephrasing it here would give the player two
    // different explanations of the same refusal.
    errorMessage.value =
      caught instanceof ApiError ? caught.message : 'No pudimos iniciar sesión. Probá de nuevo.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="screen">
    <div class="form-screen">
      <p class="eyebrow">Penka Survivor</p>
      <h1 class="screen-title display">Entrá</h1>
      <p class="screen-intro">Un equipo por fecha. El último en pie gana.</p>

      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

      <form @submit.prevent="submit">
        <label class="field">
          <span class="field-label">Email</span>
          <input
            v-model="email"
            class="field-input"
            type="email"
            autocomplete="email"
            required
            :disabled="isSubmitting"
          />
        </label>

        <label class="field">
          <span class="field-label">Contraseña</span>
          <input
            v-model="password"
            class="field-input"
            type="password"
            autocomplete="current-password"
            required
            :disabled="isSubmitting"
          />
        </label>

        <div class="form-actions">
          <button class="btn" type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Entrando…' : 'Entrar' }}
          </button>
        </div>
      </form>

      <p class="form-aside">
        ¿Todavía no tenés cuenta?
        <RouterLink :to="{ name: 'register' }">Creá una</RouterLink>
      </p>
    </div>
  </main>
</template>
