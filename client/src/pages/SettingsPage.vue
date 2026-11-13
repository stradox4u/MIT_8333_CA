<script setup lang="ts">
import { useScreenMutation, type ScreenActivity } from "../lib/screen-mutation";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/vue-query";
import KeyRound from "~icons/lucide/key-round";
import MonitorSmartphone from "~icons/lucide/monitor-smartphone";
import Laptop from "~icons/lucide/laptop";
import Trash from "~icons/lucide/trash-2";
import { useRoute, useRouter } from "vue-router";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import FormField from "../components/FormField.vue";
import SubmitButton from "../components/SubmitButton.vue";
import { meKey, meOptions, type User } from "../auth/identity";
import {
  sessionsKey,
  sessionsOptions,
  deviceName,
  displayDate,
} from "../auth/sessions";
import { useAuthNavigation } from "../auth/navigation";
import { api, ApiError, errorMessage } from "../lib/api";
import { newPasswordRule, requiredPassword, useFields } from "../lib/fields";
import FreshAuthentication from "../components/FreshAuthentication.vue";
import {
  rememberDestination,
  type ResumeSection,
} from "../auth/return-context";
import { useUiStore } from "../stores/ui";

const queryClient = useQueryClient();
const navigation = useAuthNavigation();
const ui = useUiStore();
const linkErrors = ref<Record<ResumeSection, string>>({
  password: "",
  erase: "",
});
const me = useQuery(meOptions);
const sessions = useQuery(sessionsOptions);
const originalUserId = me.data.value?.id;
const freshPassword = ref(false);
const feedback = ref("");
const route = useRoute();
const router = useRouter();
const confirmErasure = ref(route.hash === "#erase");
const acknowledged = ref(false);
const acknowledgementError = ref("");
const freshErasure = ref(false);
const eraseForm = useFields(
  { currentPassword: "" },
  {
    currentPassword: (value) =>
      freshErasure.value && me.data.value?.hasPassword
        ? requiredPassword("current password")(value)
        : "",
  },
);
const sessionError = ref("");
const confirmEverywhere = ref(false);
const inFlight = useIsMutating();
const passwordForm = useFields(
  { newPassword: "", confirmPassword: "", currentPassword: "" },
  {
    newPassword: newPasswordRule,
    confirmPassword: (value, values) =>
      !value
        ? "Confirm your new password."
        : value !== values.newPassword
          ? "Your passwords do not match."
          : "",
    currentPassword: (value) =>
      freshPassword.value && me.data.value?.hasPassword
        ? requiredPassword("current password")(value)
        : "",
  },
);
function clearPasswords() {
  passwordForm.values.newPassword = "";
  passwordForm.values.confirmPassword = "";
  passwordForm.values.currentPassword = "";
  eraseForm.values.currentPassword = "";
}
onBeforeUnmount(clearPasswords);
async function verifyIdentity(activity: ScreenActivity) {
  const user = await queryClient.fetchQuery({ ...meOptions, staleTime: 0 });
  if (!activity.isCurrent()) return false;
  if (!user) {
    clearPasswords();
    await navigation.expire();
    return false;
  }
  if (user.id !== originalUserId) {
    clearPasswords();
    await navigation.identityChanged();
    return false;
  }
  return true;
}
const password = useScreenMutation({
  mutationFn: async (_, activity) => {
    const body = JSON.stringify({
      newPassword: passwordForm.values.newPassword,
      ...(passwordForm.values.currentPassword
        ? { currentPassword: passwordForm.values.currentPassword }
        : {}),
    });
    if (!(await verifyIdentity(activity))) return false;
    await api<void>("/auth/password", { method: "PUT", body });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: meKey }),
      queryClient.invalidateQueries({ queryKey: sessionsKey }),
    ]);
    return true;
  },
  onSuccess: async (saved) => {
    if (!saved) return;
    clearPasswords();
    freshPassword.value = false;
    feedback.value = "Password saved. Your other sessions have ended.";
  },
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 401) {
      clearPasswords();
      await navigation.expire();
    } else if (
      error instanceof ApiError &&
      error.code === "fresh_authentication_required"
    )
      freshPassword.value = true;
    else if (
      error instanceof ApiError &&
      error.code === "wrong_current_password"
    )
      passwordForm.errors.currentPassword = "The current password is wrong.";
    else passwordForm.showError(error);
  },
});
const revoke = useScreenMutation({
  mutationFn: async (id: string, activity) => {
    if (!(await verifyIdentity(activity))) return false;
    try {
      await api<void>(`/auth/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
    await queryClient.invalidateQueries({ queryKey: sessionsKey });
    return true;
  },
  onMutate: () => {
    sessionError.value = "";
    feedback.value = "";
  },
  onSuccess: async (changed) => {
    if (changed) {
      feedback.value = "Session ended.";
    }
  },
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 401)
      await navigation.expire();
    else sessionError.value = errorMessage(error);
  },
});
const logout = useScreenMutation({
  mutationFn: (everywhere: boolean) => navigation.signOut(everywhere),
  onError: (error) => {
    sessionError.value = errorMessage(error);
  },
});
function prepareReauthentication(section: ResumeSection) {
  rememberDestination(`/account/settings#${section}`, originalUserId, section);
  clearPasswords();
  ui.notice = "";
}
const reauthenticate = useScreenMutation({
  mutationFn: async (section: ResumeSection, activity) => {
    if (!(await verifyIdentity(activity))) return false;
    await api<void>("/auth/sign-in-link", {
      method: "POST",
      body: JSON.stringify({
        email: me.data.value!.email,
        keepSignedIn: ui.keepSignedIn,
      }),
    });
    if (!activity.isCurrent()) return false;
    rememberDestination(
      `/account/settings#${section}`,
      originalUserId,
      section,
    );
    ui.email = me.data.value!.email;
    clearPasswords();
    return true;
  },
  onMutate: (section) => {
    linkErrors.value[section] = "";
  },
  onSuccess: async (sent) => {
    if (sent) await router.push("/check-email");
  },
  onError: (error, section) => {
    linkErrors.value[section] = errorMessage(error);
  },
});
const erase = useScreenMutation({
  mutationFn: async (_, activity) => {
    const body = JSON.stringify(
      eraseForm.values.currentPassword
        ? { currentPassword: eraseForm.values.currentPassword }
        : {},
    );
    if (!(await verifyIdentity(activity))) return false;
    await api<void>("/me", { method: "DELETE", body });
    // The server has erased this identity even if its originating screen left.
    // Preserve a newer, different account that may have signed in meanwhile.
    if (queryClient.getQueryData<User | null>(meKey)?.id === originalUserId) {
      await navigation.finishSignOut();
    }
    return true;
  },
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 401) {
      clearPasswords();
      await navigation.expire();
    } else if (
      error instanceof ApiError &&
      error.code === "fresh_authentication_required"
    )
      freshErasure.value = true;
    else if (
      error instanceof ApiError &&
      error.code === "wrong_current_password"
    )
      eraseForm.errors.currentPassword = "The current password is wrong.";
    else if (error instanceof ApiError && error.status === 409)
      eraseForm.formError.value =
        "Another active Administrator must be available before you can erase your account.";
    else eraseForm.showError(error);
  },
});
const busy = computed(() => inFlight.value > 0);
function submitErasure() {
  if (busy.value) return;
  acknowledgementError.value = acknowledged.value
    ? ""
    : "Confirm that you understand what will remain.";
  if (!eraseForm.validate() || !acknowledged.value) return;
  if (freshErasure.value && !me.data.value?.hasPassword) {
    eraseForm.formError.value = "Sign in again before confirming erasure.";
    return;
  }
  erase.mutate();
}
function cancelErasure() {
  confirmErasure.value = false;
  acknowledged.value = false;
  acknowledgementError.value = "";
  eraseForm.values.currentPassword = "";
  eraseForm.errors.currentPassword = "";
  eraseForm.formError.value = "";
}
function submitPassword() {
  feedback.value = "";
  if (busy.value || !passwordForm.validate()) return;
  if (freshPassword.value && !me.data.value?.hasPassword) {
    passwordForm.formError.value =
      "Sign in again with a Sign-in Link or Google to continue.";
    return;
  }
  password.mutate();
}
watch(
  () => sessions.error.value,
  async (error) => {
    if (error instanceof ApiError && error.status === 401) {
      clearPasswords();
      await navigation.expire();
    }
  },
);
</script>
<template>
  <WorkspaceLayout>
    <div class="settings-heading">
      <div>
        <p class="eyebrow">YOUR PROFILE &amp; SECURITY</p>
        <h1>Account settings</h1>
        <p class="intro mb-0">
          {{ me.data.value?.firstName }} {{ me.data.value?.lastName }} ·
          {{ me.data.value?.email }}
        </p>
      </div>
    </div>
    <section id="password" class="settings-section" aria-label="Password">
      <div class="section-heading">
        <span class="section-icon"><KeyRound aria-hidden="true" /></span>
        <div>
          <h2>Password</h2>
          <p>
            {{
              me.data.value?.hasPassword
                ? "Change your password. You can still use a Sign-in Link or Google."
                : "Add an optional password for another way to sign in."
            }}
          </p>
        </div>
      </div>
      <form novalidate class="space-y-5" @submit.prevent="submitPassword">
        <FormField
          v-model="passwordForm.values.newPassword"
          label="New password"
          type="password"
          autocomplete="new-password"
          :error="passwordForm.errors.newPassword"
          @blur="passwordForm.blur('newPassword')"
          @update:model-value="passwordForm.changed('newPassword')"
        />
        <FormField
          v-model="passwordForm.values.confirmPassword"
          label="Confirm new password"
          type="password"
          autocomplete="new-password"
          :error="passwordForm.errors.confirmPassword"
          @blur="passwordForm.blur('confirmPassword')"
          @update:model-value="passwordForm.changed('confirmPassword')"
        />
        <p class="field-hint">
          12–128 characters, including uppercase, lowercase, a number and a
          symbol.
        </p>
        <FreshAuthentication
          v-if="freshPassword"
          v-model="passwordForm.values.currentPassword"
          :has-password="!!me.data.value?.hasPassword"
          :error="passwordForm.errors.currentPassword"
          :link-error="linkErrors.password"
          :keep-signed-in="ui.keepSignedIn"
          :pending="
            reauthenticate.isPending.value &&
            reauthenticate.variables.value === 'password'
          "
          :disabled="busy"
          @blur="passwordForm.blur('currentPassword')"
          @change="passwordForm.changed('currentPassword')"
          @request-link="reauthenticate.mutate('password')"
          @google="prepareReauthentication('password')"
        />
        <div class="flex flex-wrap items-center gap-3">
          <SubmitButton
            class="compact-button"
            :pending="password.isPending.value"
            :disabled="busy"
            >{{
              me.data.value?.hasPassword ? "Change password" : "Set password"
            }}</SubmitButton
          ><span class="field-hint">Your other sessions will end.</span>
        </div>
        <p v-if="passwordForm.formError.value" class="field-error" role="alert">
          {{ passwordForm.formError.value }}
        </p>
      </form>
    </section>
    <section
      id="sessions"
      class="settings-section"
      aria-label="Active sessions"
    >
      <div class="section-heading">
        <span class="section-icon"
          ><MonitorSmartphone aria-hidden="true"
        /></span>
        <div>
          <h2>Active sessions</h2>
          <p>Review where you’re signed in and end any session.</p>
        </div>
      </div>
      <p v-if="sessions.isPending.value" role="status" class="field-hint">
        Loading your sessions…
      </p>
      <div
        v-for="session in sessions.data.value"
        :key="session.id"
        class="session-row"
      >
        <Laptop aria-hidden="true" />
        <div class="session-info">
          <strong
            >{{ deviceName(session.userAgent) }}
            <span v-if="session.current" class="current-badge"
              >This session</span
            ></strong
          >
          <p>
            Signed in {{ displayDate(session.signedInAt) }} · Last active
            {{ displayDate(session.lastActiveAt) }}
          </p>
        </div>
        <SubmitButton
          v-if="session.current"
          type="button"
          variant="outline"
          :pending="logout.isPending.value && !logout.variables.value"
          :disabled="busy"
          @click="logout.mutate(false)"
          >Sign out</SubmitButton
        ><SubmitButton
          v-else
          type="button"
          variant="outline"
          :aria-label="`End session for ${deviceName(session.userAgent)}`"
          :pending="
            revoke.isPending.value && revoke.variables.value === session.id
          "
          :disabled="busy"
          @click="revoke.mutate(session.id)"
          >End session</SubmitButton
        >
      </div>
      <p v-if="sessions.error.value" class="field-error" role="alert">
        {{ errorMessage(sessions.error.value) }}
      </p>
      <SubmitButton
        v-if="sessions.error.value"
        class="compact-button mt-3"
        type="button"
        variant="outline"
        :pending="sessions.isFetching.value"
        @click="sessions.refetch()"
        >Try again</SubmitButton
      >
      <SubmitButton
        type="button"
        class="compact-button mt-5"
        variant="outline"
        :disabled="busy"
        @click="confirmEverywhere = true"
        >Sign out everywhere</SubmitButton
      >
      <div
        v-if="confirmEverywhere"
        class="confirm-panel"
        role="group"
        aria-label="Confirm sign out everywhere"
      >
        <h3>Sign out on every device?</h3>
        <p>This ends every session, including the one you’re using now.</p>
        <div class="flex flex-wrap items-center gap-3">
          <SubmitButton
            type="button"
            variant="outline"
            class="compact-button"
            :pending="logout.isPending.value && logout.variables.value === true"
            :disabled="busy"
            @click="logout.mutate(true)"
            >Sign out everywhere</SubmitButton
          ><button
            type="button"
            class="row-action"
            :disabled="busy"
            @click="confirmEverywhere = false"
          >
            Cancel
          </button>
        </div>
      </div>
      <p v-if="sessionError" class="field-error" role="alert">
        {{ sessionError }}
      </p>
    </section>
    <section id="erase" class="settings-section" aria-label="Erase my account">
      <div class="section-heading">
        <span class="section-icon bg-campus-panel"
          ><Trash aria-hidden="true"
        /></span>
        <div>
          <h2>Erase my account</h2>
          <p>Permanently remove your personal information.</p>
        </div>
      </div>
      <p class="settings-copy">
        Your name, email and sign-in details will be removed. Your Service
        Requests and their text will remain.
      </p>
      <SubmitButton
        type="button"
        class="compact-button"
        variant="outline"
        :disabled="busy"
        @click="confirmErasure = true"
        >Erase my account</SubmitButton
      >
      <form
        v-if="confirmErasure"
        novalidate
        class="confirm-panel space-y-5"
        aria-label="Confirm account erasure"
        @submit.prevent="submitErasure"
      >
        <div>
          <h3>Erase your account permanently?</h3>
          <p class="settings-copy">
            This cannot be undone. You will lose access to this portal.
          </p>
        </div>
        <FreshAuthentication
          v-if="freshErasure"
          v-model="eraseForm.values.currentPassword"
          :has-password="!!me.data.value?.hasPassword"
          :error="eraseForm.errors.currentPassword"
          :link-error="linkErrors.erase"
          :keep-signed-in="ui.keepSignedIn"
          :pending="
            reauthenticate.isPending.value &&
            reauthenticate.variables.value === 'erase'
          "
          :disabled="busy"
          @blur="eraseForm.blur('currentPassword')"
          @change="eraseForm.changed('currentPassword')"
          @request-link="reauthenticate.mutate('erase')"
          @google="prepareReauthentication('erase')"
        />
        <div>
          <label class="check impact-check"
            ><input
              v-model="acknowledged"
              type="checkbox"
              :aria-invalid="acknowledgementError ? true : undefined"
              :aria-describedby="
                acknowledgementError ? 'erasure-ack-error' : undefined
              "
              @change="
                acknowledgementError = acknowledged
                  ? ''
                  : 'Confirm that you understand what will remain.'
              "
            /><span
              >I understand that my Service Requests and their text will
              remain.</span
            ></label
          >
          <p
            v-if="acknowledgementError"
            id="erasure-ack-error"
            class="field-error"
            aria-live="polite"
          >
            {{ acknowledgementError }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <SubmitButton
            class="compact-button"
            variant="danger"
            :pending="erase.isPending.value"
            :disabled="busy"
            >Erase my account permanently</SubmitButton
          ><button
            type="button"
            class="row-action"
            :disabled="busy"
            @click="cancelErasure"
          >
            Cancel
          </button>
        </div>
        <p v-if="eraseForm.formError.value" class="field-error" role="alert">
          {{ eraseForm.formError.value }}
        </p>
      </form>
    </section>
    <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
  </WorkspaceLayout>
</template>
