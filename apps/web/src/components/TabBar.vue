<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * The three-tab bar pinned to the bottom.
 *
 * "Mi pick" and "Tabla" are per-penka routes, so they need an id. When there is
 * none — the player is on the list, or has just signed in — they lead to the
 * list instead of nowhere.
 */
const props = defineProps<{ penkaId: string | null }>();

const route = useRoute();
const router = useRouter();

const tabs = computed(() => [
  { key: 'pick', label: 'Mi pick', to: penkaRoute('pick') },
  { key: 'standings', label: 'Tabla', to: penkaRoute('standings') },
  { key: 'my-penkas', label: 'Mis juegos', to: { name: 'my-penkas' } },
]);

function penkaRoute(name: 'pick' | 'standings'): { name: string; params?: { penkaId: string } } {
  return props.penkaId === null
    ? { name: 'my-penkas' }
    : { name, params: { penkaId: props.penkaId } };
}

function isActive(key: string): boolean {
  return route.name === key || (key === 'my-penkas' && route.name === 'my-penkas');
}
</script>

<template>
  <nav class="tab-bar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="tab"
      :class="{ 'is-active': isActive(tab.key) }"
      @click="router.push(tab.to)"
    >
      <svg v-if="tab.key === 'pick'" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      <svg v-else-if="tab.key === 'standings'" viewBox="0 0 24 24">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
      <svg v-else viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
        <path d="M16 5.5a3 3 0 010 5.6M18.5 20c0-2.4-1-4.1-2.6-5" />
      </svg>
      {{ tab.label }}
    </button>
  </nav>
</template>
