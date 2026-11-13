<script setup lang="ts">
import { useScreenMutation } from "../lib/screen-mutation";
import { useQuery } from "@tanstack/vue-query";
import { useId } from "vue";
import CircleCheck from "~icons/lucide/circle-check";
import AuthLayout from "../layouts/AuthLayout.vue";
import FormField from "../components/FormField.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { meOptions } from "../auth/identity";
import { useAuthNavigation } from "../auth/navigation";
import { api, ApiError } from "../lib/api";
import { nameRule, useFields } from "../lib/fields";
const user = useQuery(meOptions);
const navigation = useAuthNavigation();
const roleErrorId = useId();
const form = useFields(
  {
    firstName: user.data.value?.firstName ?? "",
    lastName: user.data.value?.lastName ?? "",
    role: "",
  },
  {
    firstName: nameRule("first name"),
    lastName: nameRule("last name"),
    role: (value) =>
      ["student", "staff"].includes(value) ? "" : "Choose Student or Staff.",
  },
);
const finish = useScreenMutation({
  mutationFn: () =>
    api<void>("/auth/sign-up/complete", {
      method: "POST",
      body: JSON.stringify({
        firstName: form.values.firstName.trim(),
        lastName: form.values.lastName.trim(),
        role: form.values.role,
      }),
    }),
  onSuccess: navigation.completeAuthentication,
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 401)
      await navigation.expire();
    else if (error instanceof ApiError && error.status === 409)
      await navigation.completeAuthentication();
    else form.showError(error);
  },
});
const signOut = useScreenMutation({
  mutationFn: () => navigation.signOut(),
  onError: form.showError,
});
function submit() {
  if (!finish.isPending.value && form.validate()) finish.mutate();
}
</script>
<template>
  <AuthLayout>
    <p class="verified"><CircleCheck aria-hidden="true" /> Email confirmed</p>
    <h1>Finish sign-up.</h1>
    <p class="intro">
      Tell us a little about yourself to start using the Service Request portal.
    </p>
    <form novalidate class="space-y-5" @submit.prevent="submit">
      <FormField
        v-model="form.values.firstName"
        label="First name"
        autocomplete="given-name"
        :maxlength="100"
        :error="form.errors.firstName"
        @blur="form.blur('firstName')"
        @update:model-value="form.changed('firstName')"
      />
      <FormField
        v-model="form.values.lastName"
        label="Last name"
        autocomplete="family-name"
        :maxlength="100"
        :error="form.errors.lastName"
        @blur="form.blur('lastName')"
        @update:model-value="form.changed('lastName')"
      />
      <fieldset
        class="role-field"
        :aria-describedby="form.errors.role ? roleErrorId : undefined"
      >
        <legend>I am a…</legend>
        <div class="grid grid-cols-2 gap-3">
          <label class="role-choice"
            ><input
              v-model="form.values.role"
              type="radio"
              value="student"
              :aria-invalid="form.errors.role ? true : undefined"
              @blur="form.blur('role')"
              @change="form.changed('role')"
            /><span
              ><strong>Student</strong><small>I study here.</small></span
            ></label
          >
          <label class="role-choice"
            ><input
              v-model="form.values.role"
              type="radio"
              value="staff"
              :aria-invalid="form.errors.role ? true : undefined"
              @blur="form.blur('role')"
              @change="form.changed('role')"
            /><span
              ><strong>Staff</strong><small>I work here.</small></span
            ></label
          >
        </div>
        <p
          v-if="form.errors.role"
          :id="roleErrorId"
          class="field-error"
          aria-live="polite"
        >
          {{ form.errors.role }}
        </p>
      </fieldset>
      <SubmitButton
        :pending="finish.isPending.value"
        :disabled="signOut.isPending.value"
        arrow
        >Finish sign-up</SubmitButton
      >
      <p v-if="form.formError.value" class="field-error" role="alert">
        {{ form.formError.value }}
      </p>
    </form>
    <p class="signed-as">
      Signed in as <strong>{{ user.data.value?.email }}</strong>
    </p>
    <SubmitButton
      type="button"
      variant="outline"
      class="mt-3"
      :pending="signOut.isPending.value"
      :disabled="finish.isPending.value"
      @click="signOut.mutate()"
      >Use another email</SubmitButton
    >
  </AuthLayout>
</template>
