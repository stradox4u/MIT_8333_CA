<script setup lang="ts">
import { watch } from "vue";
import SubmitButton from "./SubmitButton.vue";
import RequestReasonForm from "./RequestReasonForm.vue";
import RequestCorrections from "./RequestCorrections.vue";
import { useFields } from "../lib/fields";
import {
  setRequestPriority,
  type ServiceRequestDetails,
  type Priority,
} from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";
import { priorityNames } from "../service-requests/display";
const props = defineProps<{ request: ServiceRequestDetails; report: Report }>();
const priorities: Priority[] = ["low", "normal", "high", "urgent"];
const form = useFields({ priority: props.request.priority ?? "normal" }, {});
watch(
  () => props.request.priority,
  (value) => {
    form.values.priority = value ?? "normal";
  },
);
const setPriority = useRequestAction({
  reference: () => props.request.reference,
  run: (priority: Priority) =>
    setRequestPriority(props.request.reference, priority),
  done: (_, priority) => `Priority set to ${priorityNames[priority]}.`,
  report: props.report,
  validationError: form.showError,
  forbidden:
    "Your permissions changed. We’ve refreshed the request so you can see what you may do.",
});
</script>
<template>
  <div class="grid gap-4.5 mt-4.5 pt-4.5 border-t border-campus-panel">
    <form
      v-if="request.priority"
      aria-label="Set Priority"
      novalidate
      @submit.prevent="
        !setPriority.isPending.value &&
        setPriority.mutate(form.values.priority as Priority)
      "
    >
      <fieldset
        class="m-0 p-0 border-0 min-w-0"
        :disabled="setPriority.isPending.value"
      >
        <legend class="mb-2 text-[12px] font-semibold">Priority</legend>
        <div class="grid grid-cols-2 gap-2">
          <label
            v-for="priority in priorities"
            :key="priority"
            class="flex items-center gap-2 min-h-10.5 py-2 px-2.5 border border-campus-control rounded-lg text-[12px] has-checked:border-campus-navy has-checked:bg-campus-green"
          >
            <input
              v-model="form.values.priority"
              type="radio"
              name="priority"
              :value="priority"
              class="m-0 w-4 h-4 accent-campus-navy"
              :aria-invalid="!!form.errors.priority"
              :aria-describedby="
                form.errors.priority ? 'priority-error' : 'priority-hint'
              "
            />{{ priorityNames[priority] }}
          </label>
        </div>
      </fieldset>
      <p
        v-if="form.errors.priority || form.formError.value"
        id="priority-error"
        class="mt-1.25 text-error text-[11px]"
        role="alert"
      >
        {{ form.errors.priority || form.formError.value }}
      </p>
      <div
        v-if="form.values.priority !== request.priority"
        class="flex flex-wrap items-center gap-3 mt-3"
      >
        <SubmitButton compact :pending="setPriority.isPending.value"
          >Set Priority</SubmitButton
        >
        <button
          type="button"
          class="py-2 px-0.5 text-[12px] underline underline-offset-4"
          :disabled="setPriority.isPending.value"
          @click="form.values.priority = request.priority!"
        >
          Undo
        </button>
      </div>
      <p
        id="priority-hint"
        class="mt-2 mb-0 text-campus-muted text-[11px] leading-[1.65]"
      >
        Only Administrators and the current Maintenance Officer see Priority.
        Changes go in the Activity Log.
      </p>
    </form>
    <RequestCorrections :request="request" :report="report" />
    <RequestReasonForm :request="request" action="cancel" :report="report" />
  </div>
</template>
