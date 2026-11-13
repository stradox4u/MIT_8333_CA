<script setup lang="ts">
import TriangleAlert from "~icons/lucide/triangle-alert";
import type { Priority } from "../service-requests/api";
import { priorityLevels, priorityNames } from "../service-requests/display";

defineProps<{
  priority: Priority;
  /** Says "Priority:" to screen readers, where nothing else labels the tag. */
  labelled?: boolean;
}>();
const variantClasses = {
  low: "text-campus-muted",
  normal: "",
  high: "",
  urgent:
    "h-6 pt-0 pr-2.25 pb-0 pl-1.75 rounded-xl bg-campus-navy text-campus-surface font-[650] [&_.icon]:w-3.25 [&_.icon]:h-3.25",
};
</script>
<template>
  <span
    class="priority inline-flex items-center gap-1.5 text-[11px] font-[550] whitespace-nowrap"
    :class="variantClasses[priority]"
    ><TriangleAlert
      v-if="priority === 'urgent'"
      class="icon inline-block w-4 h-4 flex-none align-[-3px]"
      aria-hidden="true"
    /><span
      v-else
      class="inline-flex items-end gap-0.5 h-3 [&_span:nth-child(1)]:h-1 [&_span:nth-child(2)]:h-1.75 [&_span:nth-child(3)]:h-2.5 [&_span:nth-child(4)]:h-3.25 [&_span.off]:bg-transparent [&_span.off]:shadow-[0_0_0_1px_var(--color-campus-control)_inset]"
      aria-hidden="true"
      ><span
        class="w-0.75 rounded-[1px] bg-campus-navy"
        v-for="level in 4"
        :key="level"
        :class="{ off: level > priorityLevels[priority] }"
      ></span></span
    ><span
      v-if="labelled"
      class="absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0_0_0_0)] whitespace-nowrap border-0"
      >Priority: </span
    >{{ priorityNames[priority] }}</span
  >
</template>
