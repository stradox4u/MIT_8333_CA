<script setup lang="ts">
import { computed, useId } from "vue";

/** A labelled text input or textarea with a hint, a character count and its error. */
const props = withDefaults(
  defineProps<{
    label: string;
    name: string;
    modelValue: string;
    error?: string;
    hint?: string;
    /** Shows a count against this limit, counted as the server counts: trimmed. */
    max?: number;
    multiline?: boolean;
    placeholder?: string;
    /** Further ids that describe the field, such as a shared hint. */
    describedBy?: string;
  }>(),
  { error: "", hint: "", multiline: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string]; blur: [] }>();
const id = useId();
const count = computed(() => props.modelValue.trim().length);
const describedBy = computed(
  () =>
    [
      props.error ? `${id}-error` : "",
      props.hint ? `${id}-hint` : "",
      props.describedBy ?? "",
    ]
      .filter(Boolean)
      .join(" ") || undefined,
);
function input(event: Event) {
  emit(
    "update:modelValue",
    (event.target as HTMLInputElement | HTMLTextAreaElement).value,
  );
}
</script>
<template>
  <div
    class="min-w-0 [&_>_label]:block grid gap-1.75 [&_>_label]:m-0 [&_>_label]:text-[12px] [&_>_label]:font-semibold"
  >
    <div class="flex items-baseline justify-between gap-3">
      <label class="m-0 text-[12px] font-semibold" :for="id">{{ label }}</label
      ><span
        v-if="max"
        class="text-campus-muted text-[11px] tabular-nums whitespace-nowrap [&.over]:text-error [&.over]:font-semibold"
        :class="{ over: count > max }"
        aria-hidden="true"
        >{{ count.toLocaleString("en-GB") }} /
        {{ max.toLocaleString("en-GB") }}</span
      >
    </div>
    <textarea
      v-if="multiline"
      :id="id"
      class="w-full min-w-0 py-2.5 px-3 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[14px] h-auto min-h-33 resize-y leading-[1.6] placeholder:text-campus-muted placeholder:opacity-90 aria-invalid:border-error aria-invalid:shadow-[0_0_0_1px_var(--color-error)_inset] phone:text-[16px]"
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      @input="input"
      @blur="emit('blur')"
    ></textarea>
    <input
      v-else
      :id="id"
      class="placeholder:text-campus-muted placeholder:opacity-90 aria-invalid:border-error aria-invalid:shadow-[0_0_0_1px_var(--color-error)_inset] w-full min-w-0 h-11.75 border border-campus-control rounded-[7px] py-2.5 px-3 bg-campus-surface text-campus-navy text-[14px] phone:text-[16px]"
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      autocomplete="off"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      @input="input"
      @blur="emit('blur')"
    />
    <p
      v-if="error"
      :id="`${id}-error`"
      class="field-error text-error text-[11px] leading-[1.65] m-0"
      aria-live="polite"
    >
      {{ error }}
    </p>
    <p
      v-if="hint"
      :id="`${id}-hint`"
      class="m-0 text-campus-muted text-[11px] leading-[1.65]"
    >
      {{ hint }}
    </p>
  </div>
</template>
