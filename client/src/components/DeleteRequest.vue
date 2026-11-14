<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { api, ApiError } from "../lib/api";
import { lengthRule, useFields } from "../lib/fields";
import { useScreenMutation } from "../lib/screen-mutation";
import { useAuthNavigation } from "../auth/navigation";
import { meOptions, type User } from "../auth/identity";
import { isExpiredSession } from "../lib/expired-session";
import { serviceRequestOptions } from "../service-requests/api";
import { useUiStore } from "../stores/ui";
import TextField from "./TextField.vue";
import SubmitButton from "./SubmitButton.vue";
const props = defineProps<{ reference: string }>();
const opened = ref(false);
const acknowledged = ref(false);
const form = useFields(
  { reason: "" },
  { reason: lengthRule("a reason", 3, 1000) },
);
const router = useRouter();
const client = useQueryClient();
const navigation = useAuthNavigation();
const ui = useUiStore();
let actorId: string | undefined;
const sameActor = () =>
  client.getQueryData<User>(meOptions.queryKey)?.id === actorId;
const deletion = useScreenMutation({
  mutationFn: async (_: void, activity) => {
    const reference = props.reference;
    actorId = client.getQueryData<User>(meOptions.queryKey)?.id;
    await api(`/service-requests/${reference}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: form.values.reason.trim() }),
    });
    const key = serviceRequestOptions(reference).queryKey;
    await client.cancelQueries({ queryKey: key });
    if (activity.isCurrent() && sameActor()) {
      ui.notice = `${reference} deleted. The Requester and current officer will be notified where reachable.`;
      await router.replace("/admin/requests");
    }
    await client.resetQueries({ queryKey: key });
    client.removeQueries({ queryKey: key, type: "inactive" });
    for (const key of [
      "service-requests",
      "service-requests-summary",
      "maintenance-officers",
    ])
      void client.invalidateQueries({ queryKey: [key] });
  },
  onError: async (error, _value, activity) => {
    if (!sameActor()) return;
    if (isExpiredSession(error)) return navigation.expire();
    if (error instanceof ApiError && error.status === 403)
      await client.invalidateQueries({ queryKey: meOptions.queryKey });
    if (error instanceof ApiError && [403, 404].includes(error.status))
      await client.invalidateQueries({
        queryKey: serviceRequestOptions(props.reference).queryKey,
      });
    if (activity.isCurrent() && sameActor()) form.showError(error);
  },
});
function submit() {
  if (deletion.isPending.value || !form.validate()) return;
  if (!acknowledged.value) {
    form.formError.value =
      "Confirm that you understand the request will disappear.";
    return;
  }
  deletion.mutate(undefined);
}
</script>
<template>
  <section
    class="mb-5 p-5 border border-campus-gray rounded-xl bg-campus-surface"
    aria-label="Delete Service Request"
  >
    <SubmitButton
      v-if="!opened"
      type="button"
      compact
      variant="danger"
      :aria-expanded="opened"
      aria-controls="delete-request-form"
      @click="opened = true"
      >Delete request</SubmitButton
    >
    <form
      v-else
      id="delete-request-form"
      aria-label="Confirm request deletion"
      class="grid gap-4"
      novalidate
      @submit.prevent="submit"
    >
      <h2 class="m-0 text-base font-semibold">Delete {{ reference }}?</h2>
      <p class="m-0 text-sm leading-relaxed">
        This removes the request from lists, search, dashboards and exports. Its
        tracking link will stop working and any current Assignment will end. Its
        text, photos and history remain retained. Cancellation keeps the request
        visible.
      </p>
      <fieldset
        :disabled="deletion.isPending.value"
        class="grid gap-4 m-0 p-0 min-w-0 border-0"
      >
        <TextField
          v-model="form.values.reason"
          label="Deletion reason"
          name="reason"
          multiline
          :max="1000"
          :error="form.errors.reason"
          hint="Recorded in the Activity Log and emailed to the Requester and current officer. 3–1,000 characters."
          @blur="form.blur('reason')"
          @update:model-value="form.changed('reason')"
        />
        <label class="flex items-start gap-3 text-sm leading-relaxed"
          ><input
            v-model="acknowledged"
            type="checkbox"
            class="mt-1 accent-campus-navy"
          />I understand this request will disappear and its current Assignment
          will end.</label
        >
        <div class="flex flex-wrap gap-3 phone:[&>button]:w-full">
          <SubmitButton
            compact
            variant="danger"
            :pending="deletion.isPending.value"
            >Delete Service Request</SubmitButton
          >
          <SubmitButton
            compact
            type="button"
            variant="outline"
            @click="opened = false"
            >Keep request</SubmitButton
          >
        </div>
      </fieldset>
      <p
        v-if="form.formError.value"
        class="m-0 text-xs text-error"
        role="alert"
      >
        {{ form.formError.value }}
      </p>
    </form>
  </section>
</template>
