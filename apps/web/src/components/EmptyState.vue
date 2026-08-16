<script setup lang="ts">
const props = defineProps<{
  title: string;
  detail: string;
}>();
</script>

<template>
  <div class="empty-state">
    <h3>{{ props.title }}</h3>
    <p>{{ props.detail }}</p>
  </div>
</template>
