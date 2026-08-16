<script setup lang="ts">
/** The three shimmer bars the prototype shows while the first board loads. */
const props = withDefaults(defineProps<{ rows?: number }>(), { rows: 3 });
</script>

<template>
  <div>
    <div v-for="row in props.rows" :key="row" class="skeleton"></div>
  </div>
</template>
