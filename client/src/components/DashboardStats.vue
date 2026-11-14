<script setup lang="ts">
import type { Component } from "vue";
defineProps<{
  label: string;
  tiles: {
    label: string;
    value: number;
    href: string;
    hint: string;
    icon: Component;
    attention?: boolean;
  }[];
}>();
</script>
<template>
  <ul
    :aria-label="label"
    class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] phone:grid-cols-2 gap-3 m-0 mb-4.5 p-0 list-none phone:[&>li:last-child:nth-child(odd)]:col-span-full"
  >
    <li
      v-for="tile in tiles"
      :key="tile.label"
      class="relative grid gap-1.5 py-3.75 px-4 border rounded-xl bg-campus-surface hover:border-campus-navy"
      :class="
        tile.attention
          ? 'border-campus-navy shadow-[0_0_0_1px_var(--color-campus-navy)_inset]'
          : 'border-campus-gray'
      "
    >
      <RouterLink
        :to="tile.href"
        :aria-label="`${tile.label} ${tile.value.toLocaleString('en-GB')}`"
        class="grid gap-1.5 text-campus-navy no-underline after:absolute after:inset-0 after:rounded-xl hover:[&_.stat-value]:underline hover:[&_.stat-value]:underline-offset-4"
      >
        <span class="flex items-center gap-1.5 text-[12px] text-campus-muted"
          ><component
            :is="tile.icon"
            class="w-4 h-4 shrink-0"
            aria-hidden="true"
          />{{ tile.label }}</span
        ><span
          class="stat-value text-[30px] phone:text-[26px] font-[650] leading-[1.1] tracking-[-0.03em]"
          >{{ tile.value.toLocaleString("en-GB") }}</span
        > </RouterLink
      ><span class="text-[11px] text-campus-muted">{{ tile.hint }}</span>
    </li>
  </ul>
</template>
