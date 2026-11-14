<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import { useAuthNavigation } from "../auth/navigation";
import { ApiError } from "../lib/api";
import { meOptions } from "../auth/identity";
import { useExpiredSession } from "../lib/expired-session";
import { useFields, nameRule, emailRule } from "../lib/fields";
import { api, roles, usersOptions, useUserAction } from "../users-api";
import TextField from "../components/TextField.vue";
import SubmitButton from "../components/SubmitButton.vue";
import LoadFailure from "../components/LoadFailure.vue";
import PageNotice from "../components/PageNotice.vue";
import UserManagementPanel from "../components/UserManagementPanel.vue";
const me = useQuery(meOptions);
const users = useQuery(usersOptions);
useExpiredSession(users.error);
const navigation = useAuthNavigation();
let active = true;
onBeforeUnmount(() => {
  active = false;
});
watch(users.error, async (error) => {
  if (!(error instanceof ApiError && error.status === 403)) return;
  const actorId = me.data.value?.id;
  try {
    await navigation.retryIdentity(
      () => active && me.data.value?.id === actorId,
    );
  } catch {
    // Keep the failed read available to retry when identity cannot refresh.
  }
});
const expanded = ref<string | null>(null);
const busy = ref(false);
const notice = ref("");
const form = useFields(
  { firstName: "", lastName: "", email: "", role: "maintenance_officer" },
  {
    firstName: nameRule("first name"),
    lastName: nameRule("last name"),
    email: emailRule,
    role: (value) => (Object.hasOwn(roles, value) ? "" : "Choose a Role."),
  },
);
const invite = useUserAction({
  run: () =>
    api("/users", {
      method: "POST",
      body: JSON.stringify({ ...form.values, email: form.values.email.trim() }),
    }),
  done: () => {
    notice.value = "Invitation sent.";
    form.values.firstName = "";
    form.values.lastName = "";
    form.values.email = "";
  },
  error: form.showError,
});
function submit() {
  if (!invite.isPending.value && !busy.value && form.validate())
    invite.mutate(undefined);
}
function done(message: string) {
  notice.value = message;
  expanded.value = null;
  busy.value = false;
}
const statuses = {
  invited: "Pending Invitation",
  active: "Active",
  deactivated: "Deactivated",
  erased: "Erased",
};
</script>
<template>
  <WorkspaceLayout width="wide" section="users">
    <h1>Users</h1>
    <p class="text-sm text-campus-muted mb-6">
      Invite people and manage their access to the university Service Request
      portal.
    </p>
    <PageNotice v-if="notice" :message="notice" kind="success" />
    <section
      class="p-6 phone:p-4 mb-6 border border-campus-gray rounded-xl bg-campus-surface"
      aria-labelledby="invite-title"
    >
      <h2 id="invite-title" class="mt-0 mb-4 text-lg font-semibold">
        Invite a User
      </h2>
      <form aria-label="Invite a User" novalidate @submit.prevent="submit">
        <fieldset
          :disabled="invite.isPending.value || busy"
          class="grid grid-cols-2 phone:grid-cols-1 gap-4 m-0 p-0 min-w-0 border-0"
        >
          <TextField
            v-model="form.values.firstName"
            label="First name"
            name="firstName"
            :error="form.errors.firstName"
            @blur="form.blur('firstName')"
            @update:model-value="form.changed('firstName')"
          />
          <TextField
            v-model="form.values.lastName"
            label="Last name"
            name="lastName"
            :error="form.errors.lastName"
            @blur="form.blur('lastName')"
            @update:model-value="form.changed('lastName')"
          />
          <TextField
            v-model="form.values.email"
            label="Email"
            name="email"
            :error="form.errors.email"
            @blur="form.blur('email')"
            @update:model-value="form.changed('email')"
          />
          <div class="grid gap-2 text-xs font-semibold">
            <label for="invitation-role">Invitation Role</label
            ><select
              id="invitation-role"
              v-model="form.values.role"
              class="w-full min-w-0 rounded-lg border border-campus-control bg-campus-surface p-3 text-sm"
            >
              <option
                v-for="(label, value) in roles"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
          </div>
          <SubmitButton
            compact
            class="justify-self-start phone:w-full"
            :pending="invite.isPending.value"
            >Send Invitation</SubmitButton
          >
        </fieldset>
        <p
          v-if="form.formError.value"
          class="mt-3 mb-0 text-xs text-error"
          role="alert"
        >
          {{ form.formError.value }}
        </p>
      </form>
    </section>
    <LoadFailure
      v-if="users.isError.value"
      title="We couldn’t load Users"
      :pending="users.isFetching.value"
      @retry="users.refetch()"
    />
    <p v-else-if="users.isPending.value" role="status">Loading Users…</p>
    <section v-else aria-label="Users list" class="grid gap-3">
      <p v-if="!users.data.value?.length" class="text-sm">No Users yet.</p>
      <article
        v-for="user in users.data.value"
        :key="user.id"
        class="min-w-0 border border-campus-gray rounded-xl bg-campus-surface overflow-hidden"
      >
        <div
          class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem] tablet:grid-cols-1 items-center gap-4 p-5 phone:p-4 text-sm"
        >
          <strong class="wrap-anywhere"
            >{{ user.name }}
            <span
              v-if="user.id === me.data.value?.id"
              class="font-normal text-campus-muted"
              >(You)</span
            ></strong
          >
          <span class="wrap-anywhere"
            ><span class="sr-only">Email: </span
            >{{ user.email ?? "Personal data erased" }}</span
          >
          <span><span class="sr-only">Role: </span>{{ roles[user.role] }}</span>
          <span
            ><span class="sr-only">Account status: </span
            >{{ statuses[user.status] }}</span
          >
          <SubmitButton
            v-if="user.id !== me.data.value?.id && user.status !== 'erased'"
            compact
            variant="outline"
            type="button"
            :disabled="busy || invite.isPending.value"
            :aria-label="`${expanded === user.id ? 'Close' : 'Manage'} ${user.name}`"
            :aria-expanded="expanded === user.id"
            :aria-controls="`manage-${user.id}`"
            @click="expanded = expanded === user.id ? null : user.id"
            >{{ expanded === user.id ? "Close" : "Manage" }}</SubmitButton
          >
        </div>
        <UserManagementPanel
          v-if="expanded === user.id && user.id !== me.data.value?.id"
          :id="`manage-${user.id}`"
          :key="user.id"
          :user="user"
          @done="done"
          @busy="busy = $event"
        />
      </article>
    </section>
  </WorkspaceLayout>
</template>
