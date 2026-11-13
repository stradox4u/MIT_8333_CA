<script setup lang="ts">
import type { Status } from "../service-requests/api";
import { statusIcons, statusNames } from "../service-requests/display";

defineProps<{
  status: Status;
  /** Says "Status:" to screen readers, where nothing else labels the chip. */
  labelled?: boolean;
}>();
</script>
<template>
  <span class="status-chip" :class="`status-${status}`"
    ><component :is="statusIcons[status]" class="icon" aria-hidden="true" /><span
      v-if="labelled"
      class="visually-hidden"
      >Status: </span
    >{{ statusNames[status] }}</span
  >
</template>
