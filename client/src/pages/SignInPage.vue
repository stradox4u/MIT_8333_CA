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
    <p
      class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
    >
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
      <label
        class="flex items-center gap-2.25 w-fit text-campus-muted text-[12px] leading-[1.6] phone:min-h-9.5"
        ><input
          class="w-4 h-4 flex-none m-0 accent-campus-navy"
          v-model="keepSignedIn"
          type="checkbox"
        /><span>Keep me signed in</span></label
      >
      <SubmitButton :pending="sendLink.isPending.value" arrow
        >Email me a Sign-in Link</SubmitButton
      >
      <p
        v-if="form.formError.value"
        class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
        role="alert"
      >
        {{ form.formError.value }}
      </p>
    </form>
    <template v-if="!signup && !recovery">
      <div
        class="flex items-center gap-3 my-4.75 mx-0 text-campus-muted text-[11px]"
      >
        <span class="h-px flex-1 bg-campus-gray opacity-60"></span>or<span
          class="h-px flex-1 bg-campus-gray opacity-60"
        ></span>
      </div>
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
        class="inline-block border-0 py-2 px-0.5 text-campus-navy bg-transparent text-[12px] underline underline-offset-4 [&.centered]:block [&.centered]:w-fit [&.centered]:mt-1.75 [&.centered]:mx-auto [&.centered]:mb-0 [&.centered]:text-center phone:min-h-11 centered"
        to="/sign-in/password"
        @click="ui.email = form.values.email"
        >Use a password instead</RouterLink
      >
    </template>
    <RouterLink
      v-if="recovery"
      to="/sign-in/password"
      class="inline-block border-0 py-2 px-0.5 text-campus-navy bg-transparent text-[12px] underline underline-offset-4 [&.centered]:block [&.centered]:w-fit [&.centered]:mt-1.75 [&.centered]:mx-auto [&.centered]:mb-0 [&.centered]:text-center phone:min-h-11 centered"
      >Back to password sign-in</RouterLink
    >
    <p
      v-else
      class="mt-5.5 mx-0 mb-0 text-center text-[12px] text-campus-muted"
    >
      {{ signup ? "Already signed up?" : "New to the portal?" }}
      <RouterLink
        class="text-campus-navy font-semibold underline underline-offset-[3px]"
        :to="signup ? '/sign-in' : '/sign-up'"
        >{{ signup ? "Sign in" : "Sign up" }}</RouterLink
      >
    </p>
  </AuthLayout>
</template>
