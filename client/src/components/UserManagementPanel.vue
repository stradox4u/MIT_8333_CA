<script setup lang="ts">
import { ref } from "vue";
import {
  api,
  roles,
  useUserAction,
  type ManagedUser,
  type Role,
} from "../users-api";
import { emailRule, useFields } from "../lib/fields";
import TextField from "./TextField.vue";
import SubmitButton from "./SubmitButton.vue";
const props = defineProps<{ user: ManagedUser }>();
const emit = defineEmits<{ done: [message: string]; busy: [value: boolean] }>();
const role = ref<Role>(props.user.role);
const confirmation = ref<
  "role" | "deactivate" | "reactivate" | "erase" | "email" | null
>(null);
const form = useFields({ email: props.user.email ?? "" }, { email: emailRule });
const action = useUserAction({
  run: (
    kind:
      "role" | "deactivate" | "reactivate" | "erase" | "email" | "invitation",
  ) =>
    api(`/users/${props.user.id}/${kind}`, {
      method: ["role", "email"].includes(kind) ? "PATCH" : "POST",
      ...(["role", "email"].includes(kind)
        ? {
            body: JSON.stringify(
              kind === "role"
                ? { role: role.value }
                : { email: form.values.email.trim() },
            ),
          }
        : {}),
    }),
  done: (kind) => {
    emit(
      "done",
      {
        role: "Role changed.",
        deactivate: "User deactivated.",
        reactivate: "User reactivated.",
        erase: "Personal data erased.",
        email: "Invitation email corrected and resent.",
        invitation: "Invitation resent.",
      }[kind],
    );
  },
  error: form.showError,
});
import { watch } from "vue";
watch(action.isPending, (value) => emit("busy", value));
function submit() {
  if (!confirmation.value || action.isPending.value) return;
  if (confirmation.value === "email" && !form.validate()) return;
  action.mutate(confirmation.value);
}
const explanations = {
  role: "Their permissions will change. Moving a Maintenance Officer to another Role returns their Open work to Submitted.",
  deactivate:
    "They will be signed out and unable to sign in. Their Open Assignments return to Submitted.",
  reactivate:
    "They will be able to sign in again. Previous Assignments stay with their current officers.",
  erase:
    "Their name, email and authentication data will be permanently erased. Their requests and history remain as Erased user. This cannot be undone.",
  email:
    "The pending Invitation will be sent to this address. Only change it to the intended recipient’s email.",
};
</script>
<template>
  <form
    aria-label="Manage User"
    class="grid gap-4 p-5 bg-campus-panel rounded-lg"
    novalidate
    @submit.prevent="submit"
  >
    <fieldset
      class="m-0 p-0 border-0 grid gap-4 min-w-0"
      :disabled="action.isPending.value"
    >
      <template v-if="user.status !== 'erased'">
        <div class="grid gap-2 text-xs font-semibold">
          <label :for="`user-role-${user.id}`">Role</label>
          <select
            :id="`user-role-${user.id}`"
            v-model="role"
            class="w-full min-w-0 rounded-lg border border-campus-control bg-campus-surface p-3 text-sm"
          >
            <option v-for="(label, value) in roles" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
        </div>
        <SubmitButton
          type="button"
          compact
          variant="outline"
          :disabled="role === user.role"
          @click="confirmation = 'role'"
          >Change Role</SubmitButton
        >
        <template v-if="user.status === 'invited'">
          <TextField
            v-model="form.values.email"
            label="Invitation email"
            name="email"
            :error="form.errors.email"
            @blur="form.blur('email')"
            @update:model-value="form.changed('email')"
          />
          <div class="flex flex-wrap gap-3">
            <SubmitButton
              type="button"
              compact
              variant="outline"
              @click="confirmation = 'email'"
              >Correct email and resend</SubmitButton
            >
            <SubmitButton
              type="button"
              compact
              variant="outline"
              :pending="action.isPending.value && !confirmation"
              @click="
                confirmation = null;
                action.mutate('invitation');
              "
              >Resend Invitation</SubmitButton
            >
          </div>
        </template>
        <div class="flex flex-wrap gap-3">
          <SubmitButton
            type="button"
            compact
            variant="outline"
            @click="
              confirmation =
                user.status === 'deactivated' ? 'reactivate' : 'deactivate'
            "
            >{{
              user.status === "deactivated" ? "Reactivate" : "Deactivate"
            }}</SubmitButton
          >
          <SubmitButton
            type="button"
            compact
            variant="danger"
            @click="confirmation = 'erase'"
            >Erase personal data</SubmitButton
          >
        </div>
        <div
          v-if="confirmation"
          class="grid gap-3 border border-campus-control rounded-lg p-4"
          role="group"
          aria-label="Confirm User change"
        >
          <p class="m-0 text-sm leading-relaxed">
            {{ explanations[confirmation] }}
          </p>
          <div class="flex flex-wrap gap-3">
            <SubmitButton
              compact
              :variant="confirmation === 'erase' ? 'danger' : 'primary'"
              :pending="action.isPending.value"
              >Confirm
              {{
                confirmation === "role"
                  ? "Role change"
                  : confirmation === "email"
                    ? "email correction"
                    : confirmation === "erase"
                      ? "erasure"
                      : confirmation === "deactivate"
                        ? "deactivation"
                        : "reactivation"
              }}</SubmitButton
            >
            <SubmitButton
              type="button"
              compact
              variant="outline"
              @click="confirmation = null"
              >Keep current details</SubmitButton
            >
          </div>
        </div>
      </template>
      <p v-else class="m-0 text-sm text-campus-muted">
        Personal data has been erased. This User cannot be managed.
      </p>
    </fieldset>
    <p v-if="form.formError.value" class="m-0 text-xs text-error" role="alert">
      {{ form.formError.value }}
    </p>
  </form>
</template>
