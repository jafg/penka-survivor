<script setup lang="ts">
import { useAppStore } from './stores/app';

const store = useAppStore();
</script>

<template>
  <main>
    <h1>{{ store.title }}</h1>
    <p>Player app placeholder — game UI lands here.</p>
  </main>
</template>
