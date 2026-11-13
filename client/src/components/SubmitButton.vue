<script setup lang="ts">
import ArrowRight from "~icons/lucide/arrow-right";
withDefaults(
  defineProps<{
    pending?: boolean;
    disabled?: boolean;
    variant?: "primary" | "outline" | "danger";
    type?: "submit" | "button";
    arrow?: boolean;
  }>(),
  {
    pending: false,
    disabled: false,
    variant: "primary",
    type: "submit",
    arrow: false,
  },
);
</script>
<template>
  <button
    :type="type"
    class="button"
    :class="`button-${variant}`"
    :disabled="pending || disabled"
    :aria-busy="pending || undefined"
  >
    <span class="button-label"><slot /></span>
    <span v-if="pending" class="spinner" aria-hidden="true"></span
    ><ArrowRight v-else-if="arrow" class="button-arrow" aria-hidden="true" />
  </button>
</template>
