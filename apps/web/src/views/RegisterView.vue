<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const displayName = ref('');
const email = ref('');
const password = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

async function submit(): Promise<void> {
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    await auth.register(email.value, password.value, displayName.value);
    await router.replace({ name: 'my-penkas' });
  } catch (caught) {
    errorMessage.value =
      caught instanceof ApiError ? caught.message : 'No pudimos crear tu cuenta. Probá de nuevo.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="screen">
    <div class="form-screen">
      <p class="eyebrow">Penka Survivor</p>
      <h1 class="screen-title display">Creá tu cuenta</h1>
      <p class="screen-intro">
        Tu nombre es el que ven los demás en la tabla. Elegí uno que reconozcan.
      </p>

      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

      <form @submit.prevent="submit">
        <label class="field">
          <span class="field-label">Nombre</span>
          <input
            v-model="displayName"
            class="field-input"
            type="text"
            autocomplete="nickname"
            required
            :disabled="isSubmitting"
          />
        </label>

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
            autocomplete="new-password"
            required
            :disabled="isSubmitting"
          />
          <!--
            The eight-character floor is the contract's (RegisterRequestSchema),
            stated so the player learns it before the server refuses, not after.
          -->
          <span class="form-aside" style="text-align: left">Mínimo 8 caracteres.</span>
        </label>

        <div class="form-actions">
          <button class="btn" type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Creando…' : 'Crear cuenta' }}
          </button>
        </div>
      </form>

      <p class="form-aside">
        ¿Ya tenés cuenta?
        <RouterLink :to="{ name: 'login' }">Entrá</RouterLink>
      </p>
    </div>
  </main>
</template>
