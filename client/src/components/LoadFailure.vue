<script setup lang="ts">
import CircleAlert from "~icons/lucide/circle-alert";
import RefreshCw from "~icons/lucide/refresh-cw";
import SubmitButton from "./SubmitButton.vue";

/**
 * A read that failed, other than an ended session: say so and offer a retry.
 * The page gives it its frame through `class`, such as `empty-state`.
 */
withDefaults(
  defineProps<{
    title: string;
    /** 1 when nothing else on the page is its heading. */
    level?: 1 | 2;
    pending: boolean;
  }>(),
  { level: 2 },
);
const emit = defineEmits<{ retry: [] }>();
</script>
<template>
  <div class="load-failure" role="alert">
    <span class="state-icon quiet"
      ><CircleAlert class="icon" aria-hidden="true"
    /></span>
    <component :is="level === 1 ? 'h1' : 'h2'">{{ title }}</component>
    <p class="intro">Check your connection and try again.</p>
    <SubmitButton
      type="button"
      variant="outline"
      class="compact-button has-request"
      :pending="pending"
      @click="emit('retry')"
      ><RefreshCw class="icon" aria-hidden="true" />Try again</SubmitButton
    >
  </div>
</template>
