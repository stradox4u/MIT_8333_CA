<script setup lang="ts">
/** A list page's eyebrow, title and introduction, as the previews set them. */
defineProps<{ eyebrow: string; title: string; intro: string }>();
</script>
<template>
  <div class="flex flex-wrap items-end justify-between gap-4.5 mb-5.5">
    <div class="min-w-0">
      <p
        class="mt-0 mx-0 text-[10px] font-semibold tracking-[0.16em] uppercase mb-3"
      >
        {{ eyebrow }}
      </p>
      <h1 class="mb-2.5">{{ title }}</h1>
      <p class="text-[13px] leading-[1.7] text-campus-muted wrap-anywhere m-0">
        {{ intro }}
      </p>
    </div>
  </div>
</template>
