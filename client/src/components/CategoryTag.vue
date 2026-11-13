<script setup lang="ts">
import type { RequestCategory } from "../service-requests/api";
import { categoryIcon } from "../service-requests/display";

defineProps<{ category: RequestCategory }>();
</script>
<template>
  <span
    class="category inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"
    ><component
      :is="categoryIcon(category.id)"
      class="icon inline-block flex-none align-[-3px] w-3.75 h-3.75"
      aria-hidden="true"
    />{{ category.name }}</span
  >
</template>
