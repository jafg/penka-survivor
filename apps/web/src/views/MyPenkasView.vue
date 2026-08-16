<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '../components/EmptyState.vue';
import PenkaCard from '../components/PenkaCard.vue';
import SkeletonList from '../components/SkeletonList.vue';
import { usePenkasStore } from '../stores/penkas';

const router = useRouter();
const penkas = usePenkasStore();

onMounted(() => {
  // `App.vue` loads this on sign-in; coming back to the screen re-reads it, so a
  // penka joined on another device shows up without a reload.
  void penkas.load();
});

function open(penkaId: string): void {
  void router.push({ name: 'pick', params: { penkaId } });
}
</script>

<template>
  <main class="screen">
    <p class="eyebrow">Tus juegos</p>
    <h1 class="screen-title display">Mis Survivors</h1>
    <p class="screen-intro">
      Cada Survivor vive dentro de una Penka privada. Sumate con el código que te pasa quien lo
      creó.
    </p>

    <SkeletonList v-if="penkas.isLoading && penkas.items.length === 0" :rows="2" />

    <EmptyState
      v-else-if="penkas.items.length === 0"
      title="Todavía no jugás ningún Survivor"
      detail="Pedile el código a quien creó la Penka, o creá la tuya y armá el grupo."
    />

    <PenkaCard
      v-for="item in penkas.items"
      :key="item.penka.id"
      :item="item"
      :is-current="false"
      @open="open"
    />

    <div class="form-actions">
      <RouterLink class="btn" :to="{ name: 'join-penka' }">Sumarme con un código</RouterLink>
      <RouterLink class="btn btn--ghost" :to="{ name: 'create-penka' }">Crear una penka</RouterLink>
    </div>
  </main>
</template>
