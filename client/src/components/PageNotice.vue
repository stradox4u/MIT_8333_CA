<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import CircleCheck from "~icons/lucide/circle-check";
import CircleAlert from "~icons/lucide/circle-alert";

/** Feedback at the top of a page after an action; it takes focus so it's read out. */
const props = withDefaults(
  defineProps<{ message: string; kind?: "success" | "error" }>(),
  { kind: "success" },
);
const kinds = {
  success: "border-campus-navy",
  error: "border-error text-error",
};
const element = ref<HTMLElement | null>(null);
const focus = async () => {
  await nextTick();
  element.value?.focus();
};
onMounted(focus);
watch(() => props.message, focus);
</script>
<template>
  <p
    ref="element"
    class="flex items-start gap-2.25 mt-0 mb-4.5 py-2.5 px-3.25 border rounded-[7px] bg-campus-surface text-[12px] leading-[1.65]"
    :class="kinds[kind]"
    :role="kind === 'error' ? 'alert' : 'status'"
    tabindex="-1"
  >
    <CircleAlert
      v-if="kind === 'error'"
      class="inline-block w-4 h-4 flex-none mt-px"
      aria-hidden="true"
    /><CircleCheck
      v-else
      class="inline-block w-4 h-4 flex-none mt-px"
      aria-hidden="true"
    /><span>{{ message }}</span>
  </p>
</template>
