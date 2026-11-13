<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import SlidersHorizontal from "~icons/lucide/sliders-horizontal";
import UserRoundCheck from "~icons/lucide/user-round-check";
import Repeat from "~icons/lucide/repeat-2";
import SubmitButton from "./SubmitButton.vue";
import {
  maintenanceOfficersOptions,
  unassignOfficer,
  type ServiceRequestDetails,
} from "../service-requests/api";
import { useRequestAction, type Report } from "../service-requests/actions";

/** The Administrator's Assignment controls for an Open request. */
const props = defineProps<{
  request: ServiceRequestDetails;
  report: Report;
}>();
const emit = defineEmits<{ reassign: [] }>();

const officers = useQuery(maintenanceOfficersOptions);
const officer = computed(() => props.request.assignment?.officer ?? null);
const openAssignments = computed(
  () =>
    officers.data.value?.find((each) => each.id === officer.value?.id)
      ?.openAssignments,
);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const confirming = ref(false);
const confirmPanel = ref<HTMLElement | null>(null);
const unassignButton = ref<HTMLButtonElement | null>(null);
async function askToUnassign() {
  confirming.value = true;
  await nextTick();
  confirmPanel.value?.querySelector("button")?.focus();
}
function keep() {
  confirming.value = false;
  unassignButton.value?.focus();
}
const unassign = useRequestAction({
  reference: () => props.request.reference,
  // Takes the officer's name at the start: the answer has no Assignment.
  run: (_name: string) => unassignOfficer(props.request.reference),
  done: (details, name) =>
    `${name} unassigned. ${details.reference} is Submitted again.`,
  report: props.report,
});
watch(
  () => props.request.status,
  () => {
    confirming.value = false;
  },
);
</script>
<template>
  <section
    class="mb-4.5 border border-campus-gray p-6 rounded-[13px] bg-campus-surface phone:py-4.75 phone:px-3.75"
    aria-labelledby="manage-title"
  >
    <div class="flex items-center gap-3 mb-3">
      <span
        class="grid place-items-center flex-none w-9 h-9 rounded-[10px] bg-campus-green"
        ><SlidersHorizontal class="w-4.5 h-4.5" aria-hidden="true"
      /></span>
      <div class="flex-1 min-w-0">
        <h2 id="manage-title" class="mb-0.75">Manage</h2>
        <p class="m-0 text-campus-muted text-[12px]">Administrator actions</p>
      </div>
    </div>
    <h3 class="flex items-center gap-1.5 mt-0 mb-2 text-[12px] font-semibold">
      <UserRoundCheck class="w-4 h-4" aria-hidden="true" />Assignment
    </h3>
    <template v-if="officer">
      <div class="flex items-center gap-2.5 mb-2.5 text-[12px]">
        <span
          class="grid place-items-center flex-none w-8 h-8 rounded-full border border-campus-gray bg-campus-panel text-[11px] font-[650]"
          aria-hidden="true"
          >{{ initials(officer.name) }}</span
        >
        <div>
          <strong>{{ officer.name }}</strong>
          <span
            v-if="openAssignments !== undefined"
            class="block mt-0.75 text-campus-muted text-[11px]"
            >{{ openAssignments }} Open
            {{ openAssignments === 1 ? "Assignment" : "Assignments" }}</span
          >
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <SubmitButton
          compact
          type="button"
          variant="outline"
          :disabled="unassign.isPending.value"
          @click="emit('reassign')"
          ><Repeat
            class="w-3.75 h-3.75"
            aria-hidden="true"
          />Reassign</SubmitButton
        ><button
          ref="unassignButton"
          type="button"
          class="py-2 px-0.5 text-[12px] underline underline-offset-4"
          :aria-expanded="confirming"
          aria-controls="unassign-confirm"
          @click="askToUnassign"
        >
          Unassign
        </button>
      </div>
      <div
        v-if="confirming"
        id="unassign-confirm"
        ref="confirmPanel"
        class="mt-3.5 p-4 border border-campus-navy rounded-[9px] bg-campus-panel"
        role="group"
        aria-labelledby="unassign-title"
      >
        <h3 id="unassign-title" class="mt-0 mb-1.25 text-[14px] font-semibold">
          Unassign {{ officer.name }}?
        </h3>
        <p class="mt-0 mb-3 text-[12px] leading-[1.6]">
          {{ request.reference }} goes back to Submitted.
        </p>
        <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <SubmitButton
            compact
            type="button"
            variant="danger"
            class="pr-8"
            :pending="unassign.isPending.value"
            @click="unassign.mutate(officer.name)"
            >Unassign</SubmitButton
          ><button
            type="button"
            class="py-2 px-0.5 text-[12px] underline underline-offset-4"
            :disabled="unassign.isPending.value"
            @click="keep"
          >
            Keep Assignment
          </button>
        </div>
      </div>
    </template>
    <p v-else class="m-0 text-campus-muted text-[11px] leading-[1.6]">
      Not assigned yet. Use <strong>Assign a Maintenance Officer</strong> above.
    </p>
  </section>
</template>
