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
function submit() {
  if (!finish.isPending.value && form.validate()) finish.mutate();
}
</script>
<template>
  <AuthLayout>
    <p class="flex items-center gap-1.75 mt-0 mx-0 mb-4.5 text-[11px]">
      <CircleCheck class="w-4 h-4" aria-hidden="true" /> Email confirmed
    </p>
    <h1>Finish sign-up.</h1>
    <p
      class="intro mt-0 mx-0 mb-6.5 text-[13px] leading-[1.7] text-campus-muted wrap-anywhere"
    >
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
        class="mt-0 mx-0 mb-5 p-0 border-0 min-w-0"
        :aria-describedby="form.errors.role ? roleErrorId : undefined"
      >
        <legend class="mb-2 text-[12px] font-[550]">I am a…</legend>
        <div class="grid grid-cols-2 gap-3">
          <label
            class="flex items-start gap-2 py-3.25 px-2.5 border border-campus-control rounded-[7px] [&:has(input:checked)]:bg-campus-green [&:has(input:checked)]:border-campus-navy"
            ><input
              class="mt-1 accent-campus-navy"
              v-model="form.values.role"
              type="radio"
              value="student"
              :aria-invalid="form.errors.role ? true : undefined"
              @blur="form.blur('role')"
              @change="form.changed('role')"
            /><span
              ><strong class="block text-[12px] font-semibold">Student</strong
              ><small class="block mt-0.5 text-campus-muted text-[11px]"
                >I study here.</small
              ></span
            ></label
          >
          <label
            class="flex items-start gap-2 py-3.25 px-2.5 border border-campus-control rounded-[7px] [&:has(input:checked)]:bg-campus-green [&:has(input:checked)]:border-campus-navy"
            ><input
              class="mt-1 accent-campus-navy"
              v-model="form.values.role"
              type="radio"
              value="staff"
              :aria-invalid="form.errors.role ? true : undefined"
              @blur="form.blur('role')"
              @change="form.changed('role')"
            /><span
              ><strong class="block text-[12px] font-semibold">Staff</strong
              ><small class="block mt-0.5 text-campus-muted text-[11px]"
                >I work here.</small
              ></span
            ></label
          >
        </div>
        <p
          v-if="form.errors.role"
          :id="roleErrorId"
          class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
          aria-live="polite"
        >
          {{ form.errors.role }}
        </p>
      </fieldset>
      <SubmitButton :pending="finish.isPending.value" arrow
        >Finish sign-up</SubmitButton
      >
      <p
        v-if="form.formError.value"
        class="field-error mt-1.25 mx-0 mb-0 text-error text-[11px] leading-[1.65]"
        role="alert"
      >
        {{ form.formError.value }}
      </p>
    </form>
    <p
      class="mt-5.5 mx-0 mb-0 text-center text-[11px] text-campus-muted wrap-anywhere"
    >
      Signed in as <strong>{{ user.data.value?.email }}</strong>
    </p>
  </AuthLayout>
</template>
