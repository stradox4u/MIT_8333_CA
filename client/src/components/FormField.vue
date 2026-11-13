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
  <div class="field min-w-0 [&_input.with-toggle]:pr-16.25">
    <label class="block mb-1.75 text-[12px] font-[550]" :for="id">{{
      label
    }}</label>
    <div class="relative">
      <input
        class="w-full min-w-0 h-11.75 border border-campus-control rounded-[7px] py-2.5 px-3 bg-campus-surface text-campus-navy text-[14px] phone:text-[16px]"
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
        class="absolute top-0 right-2.5 min-h-11.75 border-0 py-0 px-0.75 bg-transparent text-[11px]"
        :aria-label="`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`"
        @click="visible = !visible"
      >
        {{ visible ? "Hide" : "Show" }}
      </button>
    </div>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
      aria-live="polite"
    >
      {{ error }}
    </p>
  </div>
</template>
