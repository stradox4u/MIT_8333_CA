<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from "vue";
import Play from "~icons/lucide/play";
import CircleCheck from "~icons/lucide/circle-check";
import Hourglass from "~icons/lucide/hourglass";
import UserRoundCheck from "~icons/lucide/user-round-check";
import UserRoundPlus from "~icons/lucide/user-round-plus";
import Wrench from "~icons/lucide/wrench";
import SubmitButton from "./SubmitButton.vue";
import TextField from "./TextField.vue";
import { useFields } from "../lib/fields";
import {
  completeWork,
  startWork,
  type ServiceRequestDetails,
} from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";
import { formatDate } from "../service-requests/display";
import ClosingActions from "./ClosingActions.vue";
import RequestReasonForm from "./RequestReasonForm.vue";

/** What happens next for this viewer, with the actions they may take now. */
const props = defineProps<{
  request: ServiceRequestDetails;
  viewer: "officer" | "admin" | "requester";
  report: Report;
  isRequester?: boolean;
}>();
const emit = defineEmits<{ assign: [] }>();
const requester = computed(
  () => props.isRequester ?? props.viewer === "requester",
);

const officer = computed(
  () => props.request.assignment?.officer.name ?? "The officer",
);
const completion = computed(() =>
  [...props.request.timeline]
    .reverse()
    .find(
      (each) => each.type === "status_update" && each.toStatus === "completed",
    ),
);
const completedOn = computed(() =>
  completion.value ? formatDate(completion.value.occurredAt) : "",
);
const answerBy = computed(() => {
  const entry = completion.value;
  return entry
    ? formatDate(
        new Date(
          Date.parse(entry.occurredAt) + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      )
    : "";
});

interface Panel {
  title: string;
  text: string;
  icon: Component;
  /** The panel asks this viewer to act. */
  next?: boolean;
}
const panel = computed<Panel | null>(() => {
  const status = props.request.status;
  if (status === "completed" && requester.value)
    return {
      title: "Is the fault fixed?",
      text: `${officer.value} marked it Completed${completedOn.value ? ` on ${completedOn.value}` : ""}. If you don’t answer ${answerBy.value ? `by ${answerBy.value}` : "within seven days"}, it becomes Verified automatically.`,
      icon: CircleCheck,
      next: true,
    };
  if (status === "completed" && props.viewer === "admin")
    return {
      title: "Verify completed work",
      text: "Confirm the fault is fixed on behalf of the Requester.",
      icon: CircleCheck,
      next: true,
    };
  if (props.viewer === "officer") {
    if (status === "assigned")
      return {
        title: "Ready to start?",
        text: "Starting moves it to In Progress.",
        icon: Play,
        next: true,
      };
    if (status === "in_progress")
      return {
        title: "Finished the work?",
        text: "Mark it Completed once the fault is fixed.",
        icon: CircleCheck,
        next: true,
      };
  }
  if (props.viewer === "admin" && status === "submitted")
    return {
      title: "Waiting for an Assignment",
      text: `Submitted ${formatDate(props.request.submittedAt)}. Choose a Maintenance Officer to work on it.`,
      icon: UserRoundPlus,
      next: true,
    };
  if (props.viewer === "requester") {
    if (status === "submitted")
      return {
        title: "Waiting for an Assignment",
        text: "An Administrator will assign a Maintenance Officer to it.",
        icon: Hourglass,
      };
    if (status === "assigned")
      return {
        title: `Assigned to ${officer.value}`,
        text: "They’ll start soon.",
        icon: UserRoundCheck,
      };
    if (status === "in_progress")
      return {
        title: `${officer.value} is working on it`,
        text: "You’ll see here when it’s Completed.",
        icon: Wrench,
      };
    if (status === "completed")
      return {
        title: "Work completed",
        text: `${officer.value} marked it Completed${completedOn.value ? ` on ${completedOn.value}` : ""}.`,
        icon: CircleCheck,
      };
  }
  if (status === "completed")
    return {
      title: "Waiting for the Requester",
      text: "It’s Completed. The Requester checks whether the fault is fixed.",
      icon: Hourglass,
    };
  return null;
});

const reference = () => props.request.reference;
const start = useRequestAction({
  reference,
  run: () => startWork(reference()),
  done: (details) => `Started. ${details.reference} is In Progress.`,
  report: props.report,
});

const completing = ref(false);
const form = useFields(
  { note: "" },
  {
    note: (value) =>
      value.trim().length > 2000 ? "Use 2,000 characters or fewer." : "",
  },
);
const complete = useRequestAction({
  reference,
  run: (note: string) => completeWork(reference(), note),
  done: (details) => `${details.reference} is Completed.`,
  report: props.report,
});
const formElement = ref<HTMLFormElement | null>(null);
async function openCompletion() {
  completing.value = !completing.value;
  if (!completing.value) return;
  await nextTick();
  formElement.value?.querySelector("textarea")?.focus();
}
function submitCompletion() {
  if (complete.isPending.value || !form.validate()) return;
  complete.mutate(form.values.note.trim());
}
watch(
  () => props.request.status,
  () => {
    completing.value = false;
  },
);
const busy = computed(() => start.isPending.value || complete.isPending.value);
</script>
<template>
  <section
    v-if="panel"
    class="mb-4.5 border p-6 rounded-[13px] bg-campus-surface phone:py-4.75 phone:px-3.75"
    :class="
      panel.next
        ? 'border-campus-navy shadow-[0_0_0_1px_var(--color-campus-navy)_inset]'
        : 'border-campus-gray'
    "
    aria-labelledby="next-title"
  >
    <div class="flex items-center gap-3">
      <span
        class="grid place-items-center flex-none w-9 h-9 rounded-[10px]"
        :class="panel.next ? 'bg-campus-green' : 'bg-campus-panel'"
        ><component :is="panel.icon" class="w-4.5 h-4.5" aria-hidden="true"
      /></span>
      <div class="flex-1 min-w-0">
        <h2 id="next-title" class="mb-0.75">{{ panel.title }}</h2>
        <p class="m-0 text-campus-muted text-[12px] leading-[1.65]">
          {{ panel.text }}
        </p>
      </div>
    </div>
    <ClosingActions
      v-if="request.status === 'completed' && (requester || viewer === 'admin')"
      :request="request"
      :is-requester="requester"
      :report="report"
    />
    <div
      v-if="requester && request.status === 'submitted'"
      class="flex flex-wrap items-start gap-3 mt-4"
    >
      <RouterLink
        :to="`/requests/${encodeURIComponent(request.reference)}/edit`"
        class="inline-flex items-center justify-center min-h-10.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-[12px] font-semibold text-campus-navy no-underline hover:bg-campus-panel phone:w-full"
        >Edit details</RouterLink
      >
      <RequestReasonForm
        v-if="viewer !== 'admin'"
        :request="request"
        action="cancel"
        :report="report"
      />
    </div>
    <div
      v-if="viewer === 'officer' && request.status === 'assigned'"
      class="mt-4 phone:[&>button]:w-full"
    >
      <SubmitButton
        compact
        type="button"
        class="pr-8"
        :pending="start.isPending.value"
        :disabled="busy"
        @click="start.mutate(undefined)"
        ><Play class="w-3.75 h-3.75" aria-hidden="true" />Start
        work</SubmitButton
      >
    </div>
    <div
      v-else-if="viewer === 'officer' && request.status === 'in_progress'"
      class="mt-4"
    >
      <SubmitButton
        compact
        type="button"
        class="phone:w-full"
        :aria-expanded="completing"
        aria-controls="complete-form"
        @click="openCompletion"
        ><CircleCheck
          class="w-3.75 h-3.75"
          aria-hidden="true"
        />Complete</SubmitButton
      >
      <form
        v-if="completing"
        id="complete-form"
        ref="formElement"
        class="grid gap-3 mt-3.5 p-4 border border-campus-navy rounded-[9px] bg-campus-panel"
        :aria-label="`Complete ${request.reference}`"
        novalidate
        @submit.prevent="submitCompletion"
      >
        <TextField
          v-model="form.values.note"
          label="Note for the Requester (optional)"
          name="note"
          multiline
          :max="2000"
          :error="form.errors.note"
          hint="What you did, and anything they should check. Up to 2,000 characters."
          @blur="form.blur('note')"
          @update:model-value="form.changed('note')"
        />
        <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <SubmitButton
            compact
            class="pr-8"
            :pending="complete.isPending.value"
            :disabled="busy"
            >Mark as Completed</SubmitButton
          ><button
            type="button"
            class="py-2 px-0.5 text-[12px] underline underline-offset-4"
            @click="completing = false"
          >
            Back
          </button>
        </div>
      </form>
    </div>
    <div
      v-else-if="viewer === 'admin' && request.status === 'submitted'"
      class="mt-4"
    >
      <SubmitButton
        compact
        type="button"
        class="phone:w-full"
        @click="emit('assign')"
        ><UserRoundPlus class="w-3.75 h-3.75" aria-hidden="true" />Assign a
        Maintenance Officer</SubmitButton
      >
    </div>
  </section>
</template>
