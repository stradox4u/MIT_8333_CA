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
      <p
        class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
      >
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
        <p
          v-if="replacement.formError.value"
          class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
          role="alert"
        >
          {{ replacement.formError.value }}
        </p>
      </form>
      <RouterLink
        to="/sign-in"
        class="inline-block border-0 py-2 px-0.5 text-campus-navy bg-transparent text-[12px] underline underline-offset-4 [&.centered]:block [&.centered]:w-fit [&.centered]:mt-1.75 [&.centered]:mx-auto [&.centered]:mb-0 [&.centered]:text-center phone:min-h-11 centered"
        >Back to sign in</RouterLink
      ></template
    >
    <template v-else
      ><span
        class="state-icon w-11.5 h-11.5 grid place-items-center bg-campus-green border border-campus-navy rounded-[13px] mb-6 [&.quiet]:bg-campus-panel [&_.icon]:w-5.5 [&_.icon]:h-5.5"
        ><ShieldCheck class="w-5.5 h-5.5" aria-hidden="true"
      /></span>
      <h1>You’re one step away.</h1>
      <p
        class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
      >
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
      <p
        v-if="error"
        class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
        role="alert"
      >
        {{ error }}
      </p>
      <RouterLink
        to="/sign-in"
        class="inline-block border-0 py-2 px-0.5 text-campus-navy bg-transparent text-[12px] underline underline-offset-4 [&.centered]:block [&.centered]:w-fit [&.centered]:mt-1.75 [&.centered]:mx-auto [&.centered]:mb-0 [&.centered]:text-center phone:min-h-11 centered"
        >Back to sign in</RouterLink
      ></template
    >
  </AuthLayout>
</template>
