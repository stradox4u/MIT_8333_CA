<script setup lang="ts">
import TriangleAlert from "~icons/lucide/triangle-alert";
import type { Priority } from "../service-requests/api";
import { priorityLevels, priorityNames } from "../service-requests/display";

defineProps<{
  priority: Priority;
  /** Says "Priority:" to screen readers, where nothing else labels the tag. */
  labelled?: boolean;
}>();
</script>
<template>
  <span class="priority" :class="`priority-${priority}`"
    ><TriangleAlert
      v-if="priority === 'urgent'"
      class="icon"
      aria-hidden="true" /><span
      v-else
      class="priority-bars"
      aria-hidden="true"
      ><span
        v-for="level in 4"
        :key="level"
        :class="{ off: level > priorityLevels[priority] }"
      ></span></span
    ><span v-if="labelled" class="visually-hidden">Priority: </span
    >{{ priorityNames[priority] }}</span
  >
</template>
