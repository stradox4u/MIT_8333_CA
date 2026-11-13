<script setup lang="ts">
import { useScreenMutation } from "../lib/screen-mutation";
import { onBeforeUnmount, toRef } from "vue";
import AuthLayout from "../layouts/AuthLayout.vue";
import FormField from "../components/FormField.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { useUiStore } from "../stores/ui";
import { useAuthNavigation } from "../auth/navigation";
import { api, ApiError } from "../lib/api";
import { emailRule, requiredPassword, useFields } from "../lib/fields";
const ui = useUiStore();
const navigation = useAuthNavigation();
const keepSignedIn = toRef(ui, "keepSignedIn");
const form = useFields(
  { email: ui.email, password: "" },
  { email: emailRule, password: requiredPassword() },
);
onBeforeUnmount(() => {
  form.values.password = "";
});
const signin = useScreenMutation({
  mutationFn: () =>
    api<void>("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({
        email: form.values.email,
        password: form.values.password,
        keepSignedIn: keepSignedIn.value,
      }),
    }),
  onSuccess: async () => {
    form.values.password = "";
    await navigation.completeAuthentication();
  },
  onError: (error) => {
    if (error instanceof ApiError && error.status === 401)
      form.errors.password = "Wrong email or password.";
    else form.showError(error);
  },
});
function submit() {
  if (!signin.isPending.value && form.validate()) {
    ui.email = form.values.email;
    ui.notice = "";
    signin.mutate();
  }
}
</script>
<template>
  <AuthLayout>
    <h1>Sign in.</h1>
    <p class="intro">Use your email address and password.</p>
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
      <FormField
        v-model="form.values.password"
        label="Password"
        type="password"
        autocomplete="current-password"
        :error="form.errors.password"
        @blur="form.blur('password')"
        @update:model-value="form.changed('password')"
      />
      <label class="check"
        ><input v-model="keepSignedIn" type="checkbox" /><span
          >Keep me signed in</span
        ></label
      >
      <SubmitButton :pending="signin.isPending.value" arrow
        >Sign in</SubmitButton
      >
      <p v-if="form.formError.value" class="field-error" role="alert">
        {{ form.formError.value }}
      </p>
    </form>
    <RouterLink
      class="text-link centered"
      to="/recover"
      @click="ui.email = form.values.email"
      >Forgot your password?</RouterLink
    >
    <RouterLink
      class="text-link centered"
      to="/sign-in"
      @click="ui.email = form.values.email"
      >Use a Sign-in Link instead</RouterLink
    >
    <p class="switch-link">
      New to the portal?
      <RouterLink to="/sign-up" @click="ui.email = form.values.email"
        >Sign up</RouterLink
      >
    </p>
  </AuthLayout>
</template>
