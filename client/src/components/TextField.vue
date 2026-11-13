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
  <div class="field sr-field">
    <div class="field-row">
      <label :for="id">{{ label }}</label
      ><span
        v-if="max"
        class="char-count"
        :class="{ over: count > max }"
        aria-hidden="true"
        >{{ count.toLocaleString("en-GB") }} /
        {{ max.toLocaleString("en-GB") }}</span
      >
    </div>
    <textarea
      v-if="multiline"
      :id="id"
      class="textarea"
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
      class="input"
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      autocomplete="off"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      @input="input"
      @blur="emit('blur')"
    />
    <p v-if="error" :id="`${id}-error`" class="field-error" aria-live="polite">
      {{ error }}
    </p>
    <p v-if="hint" :id="`${id}-hint`" class="field-hint">{{ hint }}</p>
  </div>
</template>
