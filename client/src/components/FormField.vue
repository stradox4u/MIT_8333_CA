<script setup lang="ts">
import { ref, useId } from "vue";
const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: string;
    error?: string;
    type?: string;
    autocomplete?: string;
    maxlength?: number;
    disabled?: boolean;
  }>(),
  { type: "text", error: "" },
);
const emit = defineEmits<{ "update:modelValue": [value: string]; blur: [] }>();
const id = useId();
const visible = ref(false);
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <div class="input-wrap">
      <input
        :id="id"
        :value="modelValue"
        :type="type === 'password' && visible ? 'text' : type"
        :autocomplete="autocomplete"
        :maxlength="maxlength"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${id}-error` : undefined"
        :class="{ 'with-toggle': type === 'password' }"
        @input="
          emit('update:modelValue', ($event.target as HTMLInputElement).value)
        "
        @blur="emit('blur')"
      />
      <button
        v-if="props.type === 'password'"
        type="button"
        class="show-password"
        :aria-label="`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`"
        @click="visible = !visible"
      >
        {{ visible ? "Hide" : "Show" }}
      </button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="field-error" aria-live="polite">
      {{ error }}
    </p>
  </div>
</template>
