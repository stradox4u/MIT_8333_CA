<script setup lang="ts">
import FormField from "./FormField.vue";
import SubmitButton from "./SubmitButton.vue";
import GoogleButton from "./GoogleButton.vue";
defineProps<{
  hasPassword: boolean;
  modelValue: string;
  error?: string;
  linkError?: string;
  pending?: boolean;
  disabled?: boolean;
  keepSignedIn: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  blur: [];
  change: [];
  requestLink: [];
  google: [];
}>();
</script>
<template>
  <div
    class="mt-3.75 p-4.5 border border-campus-navy rounded-[9px] bg-campus-panel [&_h3]:mt-0 [&_h3]:mx-0 [&_h3]:mb-1.5 [&_h3]:text-[14px] [&_h3]:font-semibold space-y-3"
  >
    <h3>Confirm it’s you</h3>
    <p class="mt-0 mx-0 mb-3.75 text-[12px] leading-[1.65]">
      Please confirm your identity before continuing.
    </p>
    <FormField
      v-if="hasPassword"
      :model-value="modelValue"
      label="Current password"
      type="password"
      autocomplete="current-password"
      :error="error"
      @update:model-value="
        emit('update:modelValue', $event);
        emit('change');
      "
      @blur="emit('blur')"
    />
    <p
      v-else
      class="text-campus-muted mt-0 mx-0 mb-3.75 text-[12px] leading-[1.65]"
    >
      Sign in again with a Sign-in Link or Google, then return here to continue.
    </p>
    <SubmitButton
      type="button"
      variant="outline"
      :pending="pending"
      :disabled="disabled"
      @click="emit('requestLink')"
      >Email me a Sign-in Link</SubmitButton
    >
    <p
      v-if="linkError"
      class="field-error text-error mt-0 mx-0 mb-3.75 text-[12px] leading-[1.65]"
      role="alert"
    >
      {{ linkError }}
    </p>
    <GoogleButton
      :keep-signed-in="keepSignedIn"
      :disabled="disabled"
      @before-navigate="emit('google')"
    />
  </div>
</template>
