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
    <p
      class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
    >
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
    <p
      v-if="error"
      class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="sent"
      class="mt-4.5 mx-0 mb-0 py-2.25 px-3 border-0 rounded-[7px] shadow-none bg-campus-panel text-[12px] leading-[1.65] [&.page-feedback]:flex [&.page-feedback]:items-start [&.page-feedback]:gap-2.25 [&.page-feedback]:mt-0 [&.page-feedback]:mx-0 [&.page-feedback]:mb-4.5 [&.page-feedback]:py-2.5 [&.page-feedback]:px-3.25 [&.page-feedback]:border [&.page-feedback]:border-campus-gray [&.page-feedback]:bg-campus-surface [&.success]:border-campus-navy [&_.icon]:mt-px"
      role="status"
    >
      Check your inbox for the next step.
    </p>
    <RouterLink
      to="/sign-in"
      class="inline-block border-0 py-2 px-0.5 text-campus-navy bg-transparent text-[12px] underline underline-offset-4 [&.centered]:block [&.centered]:w-fit [&.centered]:mt-1.75 [&.centered]:mx-auto [&.centered]:mb-0 [&.centered]:text-center phone:min-h-11 centered"
      >Use a different email</RouterLink
    >
  </AuthLayout>
</template>
