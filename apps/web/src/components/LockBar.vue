<script setup lang="ts">
/**
 * The deadline strip above the fixtures.
 *
 * Two states, and the copy changes with them: counting down ("Cierra en
 * 01:12:04") or shut ("Fecha cerrada · Sin cambios"). The literal "Sin cambios"
 * is the prototype's, and it is doing real work — it tells a player the screen
 * is not stale, the matchday simply cannot move any more.
 */
const props = defineProps<{
  isLocked: boolean;
  countdown: string;
}>();
</script>

<template>
  <div class="lock-bar" :class="{ 'is-locked': props.isLocked }">
    <span class="indicator"></span>
    <span class="caption">{{ props.isLocked ? 'Fecha cerrada' : 'Cierra en' }}</span>
    <span class="countdown tnum">{{ props.isLocked ? 'Sin cambios' : props.countdown }}</span>
  </div>
</template>
