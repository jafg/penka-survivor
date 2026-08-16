<script setup lang="ts">
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
</script>

<template>
  <div class="toast" :class="{ 'is-error': toast.isError }" :hidden="!toast.isVisible">
    {{ toast.message }}
  </div>
</template>
