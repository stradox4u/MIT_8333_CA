<script setup lang="ts">
import type { RequestCategory } from "../service-requests/api";
import { categoryIcon } from "../service-requests/display";

defineProps<{ category: RequestCategory }>();
</script>
<template>
  <span class="category"
    ><component
      :is="categoryIcon(category.id)"
      class="icon"
      aria-hidden="true"
    />{{ category.name }}</span
  >
</template>
