<script setup lang="ts">
import { useAppStore } from './stores/app';

const store = useAppStore();
</script>

<template>
  <main>
    <h1>{{ store.title }}</h1>
    <p>Operator app placeholder — results entry and matchday resolution land here.</p>
  </main>
</template>
