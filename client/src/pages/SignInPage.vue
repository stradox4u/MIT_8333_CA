<script setup lang="ts">
import { computed, toRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useScreenMutation } from "../lib/screen-mutation";
import GoogleButton from "../components/GoogleButton.vue";
import AuthLayout from "../layouts/AuthLayout.vue";
import FormField from "../components/FormField.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { useUiStore } from "../stores/ui";
import { api } from "../lib/api";
import { emailRule, useFields } from "../lib/fields";
import { rememberDestination } from "../auth/return-context";

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const signup = computed(() => route.name === "sign-up");
const recovery = computed(() => route.name === "recover");
const invitation = computed(() => typeof route.query.email === "string");
const form = useFields(
  {
    email: typeof route.query.email === "string" ? route.query.email : ui.email,
  },
  { email: emailRule },
);
const keepSignedIn = toRef(ui, "keepSignedIn");
const sendLink = useScreenMutation({
  mutationFn: (submitted: { email: string; keepSignedIn: boolean }) =>
    api<void>("/auth/sign-in-link", {
      method: "POST",
      body: JSON.stringify(submitted),
    }),
  onSuccess: async (_, submitted) => {
    ui.email = submitted.email;
    ui.keepSignedIn = submitted.keepSignedIn;
    await router.push("/check-email");
  },
  onError: form.showError,
});
function submit() {
  if (!sendLink.isPending.value && form.validate()) {
    ui.notice = "";
    if (recovery.value) rememberDestination("/account/settings#password");
    sendLink.mutate({
      email: form.values.email,
      keepSignedIn: keepSignedIn.value,
    });
  }
}
</script>
<template>
  <AuthLayout>
    <h1>
      {{
        recovery
          ? "Let’s get you back in."
          : signup
            ? invitation
              ? "You’re invited."
              : "A better campus starts with you."
            : "Welcome back."
      }}
    </h1>
    <p class="intro">
      {{
        recovery
          ? "Sign in with an emailed link, then set a new password in Account settings."
          : signup
            ? invitation
              ? "Sign in with the email address that received your university invitation."
              : "Enter your email to get started. You’ll add your name and Role after signing in."
            : "Sign in to manage your Service Requests."
      }}
    </p>
    <form novalidate class="space-y-5" @submit.prevent="submit">
      <FormField
        v-model="form.values.email"
        label="Email address"
        type="email"
        autocomplete="email"
        :error="form.errors.email"
        @blur="form.blur('email')"
        @update:model-value="form.changed('email')"
      />
      <label class="check"
        ><input v-model="keepSignedIn" type="checkbox" /><span
          >Keep me signed in</span
        ></label
      >
      <SubmitButton :pending="sendLink.isPending.value" arrow
        >Email me a Sign-in Link</SubmitButton
      >
      <p v-if="form.formError.value" class="field-error" role="alert">
        {{ form.formError.value }}
      </p>
    </form>
    <template v-if="!signup && !recovery">
      <div class="separator"><span></span>or<span></span></div>
      <GoogleButton
        :keep-signed-in="keepSignedIn"
        :disabled="sendLink.isPending.value"
        @before-navigate="
          ui.email = form.values.email;
          ui.notice = '';
        "
        @failure="form.showError"
      />
      <RouterLink
        class="text-link centered"
        to="/sign-in/password"
        @click="ui.email = form.values.email"
        >Use a password instead</RouterLink
      >
    </template>
    <RouterLink
      v-if="recovery"
      to="/sign-in/password"
      class="text-link centered"
      >Back to password sign-in</RouterLink
    >
    <p v-else class="switch-link">
      {{ signup ? "Already signed up?" : "New to the portal?" }}
      <RouterLink :to="signup ? '/sign-in' : '/sign-up'">{{
        signup ? "Sign in" : "Sign up"
      }}</RouterLink>
    </p>
  </AuthLayout>
</template>
