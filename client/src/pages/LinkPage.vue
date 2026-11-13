<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useScreenMutation } from "../lib/screen-mutation";
import ShieldCheck from "~icons/lucide/shield-check";
import AuthLayout from "../layouts/AuthLayout.vue";
import SubmitButton from "../components/SubmitButton.vue";
import FormField from "../components/FormField.vue";
import { emailRule, useFields } from "../lib/fields";
import { useUiStore } from "../stores/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { useAuthNavigation } from "../auth/navigation";
const route = useRoute();
const router = useRouter();
const navigation = useAuthNavigation();
const token = ref("");
const unusable = ref(false);
const consumed = ref(false);
const error = ref("");
const ui = useUiStore();
const replacement = useFields({ email: ui.email }, { email: emailRule });
watch(
  () => route.query.token,
  (raw) => {
    if (typeof raw === "string" && raw.length > 0 && raw.length <= 4096) {
      token.value = raw;
      unusable.value = false;
      const query = { ...route.query };
      delete query.token;
      void router.replace({ path: route.path, query });
    } else if (!token.value && !consumed.value) unusable.value = true;
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  token.value = "";
});
const consume = useScreenMutation({
  mutationFn: () =>
    api<void>("/auth/sign-in-link/consume", {
      method: "POST",
      body: JSON.stringify({ token: token.value }),
    }),
  onMutate: () => {
    error.value = "";
  },
  onSuccess: async () => {
    consumed.value = true;
    token.value = "";
    await navigation.completeAuthentication();
  },
  onError: (failure) => {
    if (failure instanceof ApiError && [400, 401].includes(failure.status)) {
      unusable.value = true;
      token.value = "";
    } else error.value = errorMessage(failure);
  },
});
const sendReplacement = useScreenMutation({
  mutationFn: (submitted: { email: string; keepSignedIn: boolean }) =>
    api<void>("/auth/sign-in-link", {
      method: "POST",
      body: JSON.stringify(submitted),
    }),
  onSuccess: async (_, submitted) => {
    ui.email = submitted.email;
    await router.push("/check-email");
  },
  onError: replacement.showError,
});
function replaceLink() {
  if (!sendReplacement.isPending.value && replacement.validate())
    sendReplacement.mutate({
      email: replacement.values.email,
      keepSignedIn: ui.keepSignedIn,
    });
}
</script>
<template>
  <AuthLayout>
    <template v-if="unusable"
      ><h1>This link can’t be used.</h1>
      <p class="intro">
        It may have expired or already been used. Request a new Sign-in Link to
        continue.
      </p>
      <form novalidate class="space-y-5" @submit.prevent="replaceLink">
        <FormField
          v-model="replacement.values.email"
          label="Email address"
          type="email"
          autocomplete="email"
          :error="replacement.errors.email"
          @blur="replacement.blur('email')"
          @update:model-value="replacement.changed('email')"
        /><SubmitButton :pending="sendReplacement.isPending.value" arrow
          >Send a new link</SubmitButton
        >
        <p v-if="replacement.formError.value" class="field-error" role="alert">
          {{ replacement.formError.value }}
        </p>
      </form>
      <RouterLink to="/sign-in" class="text-link centered"
        >Back to sign in</RouterLink
      ></template
    >
    <template v-else
      ><span class="state-icon"><ShieldCheck aria-hidden="true" /></span>
      <h1>You’re one step away.</h1>
      <p class="intro">
        Continue to sign in to the MIT 8333 University Service Request portal.
      </p>
      <SubmitButton
        type="button"
        :pending="consume.isPending.value"
        :disabled="consumed"
        arrow
        @click="consume.mutate()"
        >Continue signing in</SubmitButton
      >
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <RouterLink to="/sign-in" class="text-link centered"
        >Back to sign in</RouterLink
      ></template
    >
  </AuthLayout>
</template>
