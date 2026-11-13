<script setup lang="ts">
import { useScreenMutation } from "../lib/screen-mutation";
import { ref } from "vue";
import AuthLayout from "../layouts/AuthLayout.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { useAuthNavigation } from "../auth/navigation";
import { errorMessage } from "../lib/api";
const navigation = useAuthNavigation();
const error = ref("");
const retry = useScreenMutation({
  mutationFn: (_, activity) => navigation.retryIdentity(activity.isCurrent),
  onMutate: () => {
    error.value = "";
  },
  onError: (failure) => {
    error.value = errorMessage(failure);
  },
});
</script>
<template>
  <AuthLayout
    ><h1>We couldn’t check your sign-in.</h1>
    <p
      class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
    >
      Please try again to continue. Your sign-in won’t be submitted again.
    </p>
    <SubmitButton
      type="button"
      :pending="retry.isPending.value"
      @click="retry.mutate()"
      >Try again</SubmitButton
    >
    <p
      v-if="error"
      class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
      role="alert"
    >
      {{ error }}
    </p></AuthLayout
  >
</template>
