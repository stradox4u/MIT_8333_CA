<script setup lang="ts">
import { useScreenMutation } from "../lib/screen-mutation";
import { ref } from "vue";
import AuthLayout from "../layouts/AuthLayout.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { useUiStore } from "../stores/ui";
import { api, errorMessage } from "../lib/api";
const ui = useUiStore();
const error = ref("");
const sent = ref(false);
const resend = useScreenMutation({
  mutationFn: () =>
    api<void>("/auth/sign-in-link", {
      method: "POST",
      body: JSON.stringify({ email: ui.email, keepSignedIn: ui.keepSignedIn }),
    }),
  onMutate: () => {
    error.value = "";
    sent.value = false;
  },
  onSuccess: () => {
    sent.value = true;
  },
  onError: (failure) => {
    error.value = errorMessage(failure);
  },
});
</script>
<template>
  <AuthLayout>
    <h1>Check your inbox.</h1>
    <p class="intro">
      Check <strong>{{ ui.email || "your email" }}</strong> for your next step.
      A Sign-in Link works once and is valid for 15 minutes.
    </p>
    <SubmitButton
      v-if="ui.email"
      type="button"
      :pending="resend.isPending.value"
      arrow
      @click="resend.mutate()"
      >Send another link</SubmitButton
    >
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <p v-if="sent" class="feedback" role="status">
      Check your inbox for the next step.
    </p>
    <RouterLink to="/sign-in" class="text-link centered"
      >Use a different email</RouterLink
    >
  </AuthLayout>
</template>
