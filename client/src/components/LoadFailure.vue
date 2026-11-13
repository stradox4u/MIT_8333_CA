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
    <span
      class="state-icon w-11.5 h-11.5 grid place-items-center bg-campus-green border border-campus-navy rounded-[13px] mb-6 [&.quiet]:bg-campus-panel quiet"
      ><CircleAlert
        class="icon inline-block flex-none align-[-3px] w-5.5 h-5.5"
        aria-hidden="true"
    /></span>
    <component :is="level === 1 ? 'h1' : 'h2'">{{ title }}</component>
    <p
      class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
    >
      Check your connection and try again.
    </p>
    <SubmitButton
      compact
      type="button"
      variant="outline"
      class="compact-button has-request"
      :pending="pending"
      @click="emit('retry')"
      ><RefreshCw
        class="icon inline-block w-4 h-4 flex-none align-[-3px]"
        aria-hidden="true"
      />Try again</SubmitButton
    >
  </div>
</template>
