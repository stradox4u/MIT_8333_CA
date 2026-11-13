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
  <div class="confirm-panel space-y-3">
    <h3>Confirm it’s you</h3>
    <p>Please confirm your identity before continuing.</p>
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
    <p v-else class="field-hint">
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
    <p v-if="linkError" class="field-error" role="alert">{{ linkError }}</p>
    <GoogleButton
      :keep-signed-in="keepSignedIn"
      :disabled="disabled"
      @before-navigate="emit('google')"
    />
  </div>
</template>
