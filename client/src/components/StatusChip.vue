<script setup lang="ts">
import type { Status } from "../service-requests/api";
import { statusIcons, statusNames } from "../service-requests/display";

defineProps<{
  status: Status;
  /** Says "Status:" to screen readers, where nothing else labels the chip. */
  labelled?: boolean;
}>();
const variantClasses = {
  submitted: "border-campus-navy bg-campus-surface border-dashed",
  assigned: "bg-campus-panel border-campus-control",
  in_progress: "border-campus-navy bg-campus-navy text-campus-surface",
  completed: "border-campus-navy bg-campus-green",
  verified: "border-campus-navy bg-campus-surface border-[1.5px]",
  cancelled: "bg-campus-cancelled border-transparent",
};
</script>
<template>
  <span
    class="status-chip inline-flex items-center gap-1.25 h-6 pt-0 pr-2.25 pb-0 pl-1.75 border rounded-xl text-[11px] font-semibold leading-none whitespace-nowrap"
    :class="variantClasses[status]"
    ><component
      :is="statusIcons[status]"
      class="icon inline-block flex-none align-[-3px] w-3.5 h-3.5"
      aria-hidden="true"
    /><span
      v-if="labelled"
      class="absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0_0_0_0)] whitespace-nowrap border-0"
      >Status: </span
    >{{ statusNames[status] }}</span
  >
</template>
