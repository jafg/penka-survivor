<script setup lang="ts">
/**
 * The little yellow/red cards next to a player's name.
 *
 * `total` is a prop rather than a constant because a penka is created with one
 * to three lives — the prototype drew exactly two because its mock only ever had
 * two. Reading `penka.settings.lives` keeps the row honest for a penka that was
 * set up with three.
 */
const props = defineProps<{
  lives: number;
  total: number;
}>();
</script>

<template>
  <span class="life-cards">
    <i
      v-for="index in props.total"
      :key="index"
      class="life"
      :class="index <= props.lives ? 'life--kept' : 'life--lost'"
    />
  </span>
</template>
