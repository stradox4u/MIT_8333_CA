<script setup lang="ts">
import ArrowRight from "~icons/lucide/arrow-right";
withDefaults(
  defineProps<{
    pending?: boolean;
    disabled?: boolean;
    variant?: "primary" | "outline" | "danger" | "google";
    type?: "submit" | "button";
    arrow?: boolean;
    compact?: boolean;
  }>(),
  {
    pending: false,
    disabled: false,
    variant: "primary",
    type: "submit",
    arrow: false,
    compact: false,
  },
);
const variantClasses = {
  google:
    "bg-white text-[#1f1f1f] border-[#747775] text-[14px] font-medium enabled:hover:bg-campus-panel",
  primary:
    "border-campus-navy bg-campus-green text-campus-navy text-[12px] font-semibold enabled:hover:brightness-97",
  outline:
    "border-campus-navy bg-transparent text-campus-navy text-[12px] font-semibold enabled:hover:bg-campus-panel",
  danger:
    "border-campus-navy bg-campus-navy text-campus-surface text-[12px] font-semibold",
};
</script>
<template>
  <button
    :type="type"
    class="button inline-flex relative items-center justify-center gap-2.5 py-2.75 px-8.25 border rounded-[7px] leading-normal text-center no-underline disabled:opacity-65 [&_.icon]:w-3.75 [&_.icon]:h-3.75"
    :class="[
      variantClasses[variant],
      compact ? 'w-auto max-w-full min-h-10.5' : 'w-full min-h-11.75',
    ]"
    :disabled="pending || disabled"
    :aria-busy="pending || undefined"
  >
    <span class="inline-flex items-center justify-center gap-2.5"
      ><slot
    /></span>
    <span
      v-if="pending"
      class="absolute right-3 top-1/2 w-3.5 h-3.5 -mt-1.75 border-2 border-current border-r-transparent rounded-full animate-spin [animation-duration:0.7s] motion-reduce:animate-none"
      aria-hidden="true"
    ></span
    ><ArrowRight
      v-else-if="arrow"
      class="absolute w-4 h-4 right-3.25 top-1/2 -translate-y-1/2"
      aria-hidden="true"
    />
  </button>
</template>
