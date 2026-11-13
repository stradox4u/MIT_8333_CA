<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import Close from "~icons/lucide/x";
import Search from "~icons/lucide/search";
import SubmitButton from "./SubmitButton.vue";
import { useAuthNavigation } from "../auth/navigation";
import { ApiError, errorMessage } from "../lib/api";
import { isExpiredSession, isLoadFailure } from "../lib/expired-session";
import { useScreenMutation } from "../lib/screen-mutation";
import {
  assignOfficer,
  maintenanceOfficersOptions,
  serviceRequestOptions,
  type MaintenanceOfficer,
  type ServiceRequestDetails,
  type ServiceRequestSummary,
} from "../service-requests/api";

/**
 * Assigns or reassigns a Service Request to an active Maintenance Officer,
 * chosen from those with the fewest Open Assignments first.
 */
const props = defineProps<{
  request: Pick<
    ServiceRequestSummary,
    "reference" | "title" | "location" | "assignment"
  >;
}>();
const emit = defineEmits<{
  close: [];
  assigned: [details: ServiceRequestDetails, officer: MaintenanceOfficer];
}>();

const queryClient = useQueryClient();
const navigation = useAuthNavigation();
const officers = useQuery(maintenanceOfficersOptions);
const dialog = ref<HTMLDialogElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const search = ref("");
const chosen = ref("");
const choiceError = ref("");
const formError = ref("");

const reassigning = computed(() => !!props.request.assignment);
const verb = computed(() => (reassigning.value ? "Reassign" : "Assign"));
const currentOfficerId = computed(() => props.request.assignment?.officer.id);
const ordered = computed(() =>
  [...(officers.data.value ?? [])].sort(
    (a, b) =>
      a.openAssignments - b.openAssignments || a.name.localeCompare(b.name),
  ),
);
const shown = computed(() => {
  const query = search.value.trim().toLowerCase();
  return ordered.value.filter((officer) =>
    officer.name.toLowerCase().includes(query),
  );
});
const most = computed(() =>
  Math.max(1, ...ordered.value.map((officer) => officer.openAssignments)),
);
const load = (count: number) =>
  `${count} Open ${count === 1 ? "Assignment" : "Assignments"}`;

/** Focus goes back where it was when the picker closes. */
let opener: HTMLElement | null = null;
onMounted(async () => {
  opener = document.activeElement as HTMLElement | null;
  dialog.value?.showModal();
  await nextTick();
  searchInput.value?.focus();
});
function close() {
  dialog.value?.close();
}
function closed() {
  if (opener && document.contains(opener)) opener.focus();
  emit("close");
}
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close();
});

const assign = useScreenMutation({
  mutationFn: (officerId: string) =>
    assignOfficer(props.request.reference, officerId),
  onMutate: () => {
    formError.value = "";
  },
  onSuccess: async (details, officerId) => {
    queryClient.setQueryData(
      serviceRequestOptions(details.reference).queryKey,
      details,
    );
    void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    void queryClient.invalidateQueries({
      queryKey: maintenanceOfficersOptions.queryKey,
    });
    const officer = ordered.value.find((each) => each.id === officerId)!;
    // Report before closing: closing tells the page the picker has gone.
    opener = null;
    emit("assigned", details, officer);
    dialog.value?.close();
  },
  onError: async (error, officerId) => {
    if (isExpiredSession(error)) return navigation.expire();
    if (
      error instanceof ApiError &&
      error.issues.some((issue) => issue.path[0] === "officerId")
    ) {
      const name = ordered.value.find((each) => each.id === officerId)?.name;
      choiceError.value = `${name ?? "That officer"} is no longer an active Maintenance Officer. Choose someone else.`;
      chosen.value = "";
      void officers.refetch();
      return;
    }
    if (error instanceof ApiError && error.status === 409) {
      formError.value = `${props.request.reference} changed while you were choosing. Close this to see its latest details, then try again.`;
      void queryClient.invalidateQueries({
        queryKey: serviceRequestOptions(props.request.reference).queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      return;
    }
    formError.value = errorMessage(error);
  },
});

function submit() {
  if (assign.isPending.value) return;
  choiceError.value = chosen.value ? "" : "Choose a Maintenance Officer.";
  if (choiceError.value) return;
  assign.mutate(chosen.value);
}
</script>
<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(520px,calc(100vw-32px))] max-h-[min(720px,calc(100vh-40px))] p-0 border border-campus-navy rounded-[14px] bg-campus-surface text-campus-navy backdrop:bg-campus-navy/45 phone:mb-2.5"
    aria-labelledby="assign-title"
    @close="closed"
  >
    <form novalidate @submit.prevent="submit">
      <div
        class="flex items-start gap-3 pt-4.5 px-5 pb-3 border-b border-campus-panel"
      >
        <div class="flex-1 min-w-0">
          <h2 id="assign-title" class="text-[17px]">
            {{ verb }} {{ request.reference }}
          </h2>
          <p class="mt-0.75 mb-0 text-[12px] text-campus-muted wrap-anywhere">
            {{ request.title }} · {{ request.location }}
          </p>
        </div>
        <button
          type="button"
          class="grid place-items-center w-10 h-10 flex-none border border-transparent rounded-lg bg-transparent hover:bg-campus-panel"
          aria-label="Close"
          @click="close"
        >
          <Close class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div
        class="py-3.5 px-5 overflow-auto max-h-[calc(min(720px,100vh-40px)-160px)]"
      >
        <div class="grid gap-1.75 min-w-0">
          <label class="text-[12px] font-semibold" for="officer-search"
            >Find a Maintenance Officer</label
          >
          <div class="relative">
            <Search
              class="absolute left-3 top-3.75 w-4 h-4 text-campus-muted pointer-events-none"
              aria-hidden="true"
            /><input
              id="officer-search"
              ref="searchInput"
              v-model="search"
              class="w-full min-w-0 h-11.5 py-2.5 pr-3 pl-9 border border-campus-control rounded-[7px] bg-campus-surface text-campus-navy text-[14px] placeholder:text-campus-muted phone:text-[16px]"
              type="search"
              autocomplete="off"
              placeholder="Name"
            />
          </div>
        </div>
        <fieldset
          class="grid gap-1.5 min-w-0 mt-2.5 p-0 border-0"
          aria-describedby="officer-hint"
          :aria-invalid="choiceError ? true : undefined"
        >
          <legend class="sr-only">Maintenance Officer</legend>
          <p id="officer-hint" class="m-0 text-campus-muted text-[11px]">
            Active Maintenance Officers, fewest Open Assignments first.
          </p>
          <p
            v-if="officers.isPending.value"
            class="m-0 text-campus-muted text-[11px]"
            role="status"
          >
            Loading Maintenance Officers…
          </p>
          <div v-else-if="isLoadFailure(officers.error.value)" role="alert">
            <p class="m-0 text-error text-[11px]">
              We couldn’t load the Maintenance Officers.
            </p>
            <button
              type="button"
              class="py-2 px-0.5 text-[12px] underline underline-offset-4"
              @click="officers.refetch()"
            >
              Try again
            </button>
          </div>
          <label
            v-for="officer in shown"
            :key="officer.id"
            class="grid grid-cols-[auto_minmax(0,1fr)_132px] items-center gap-x-2.75 gap-y-1 py-2.5 px-3 border border-campus-control rounded-[9px] bg-campus-surface text-[12px] has-checked:bg-campus-green has-checked:border-campus-navy has-checked:shadow-[0_0_0_1px_var(--color-campus-navy)_inset] has-disabled:opacity-70 has-disabled:bg-campus-panel has-focus-visible:outline-3 has-focus-visible:outline-campus-navy has-focus-visible:outline-offset-2 phone:grid-cols-[auto_minmax(0,1fr)]"
            ><input
              v-model="chosen"
              type="radio"
              name="officer"
              :value="officer.id"
              :disabled="officer.id === currentOfficerId"
              :aria-describedby="choiceError ? 'officer-error' : undefined"
              class="m-0 w-4 h-4 accent-campus-navy focus-visible:outline-none"
              @change="choiceError = ''" /><span
              class="officer-name flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold"
              >{{ officer.name
              }}<span
                v-if="officer.id === currentOfficerId"
                class="py-0.5 px-1.75 rounded bg-campus-panel text-[10px] font-[550]"
                >Current officer</span
              ></span
            ><span
              class="officer-load grid justify-items-end gap-1 text-[11px] text-campus-muted tabular-nums phone:col-start-2 phone:justify-items-start"
              ><span>{{ load(officer.openAssignments) }}</span
              ><span
                class="w-24 h-1.5 rounded-[3px] bg-campus-panel shadow-[0_0_0_1px_var(--color-campus-gray)_inset] overflow-hidden"
                aria-hidden="true"
                ><span
                  class="block h-full rounded-[3px] bg-campus-navy"
                  :style="{
                    width: `${Math.round((officer.openAssignments / most) * 100)}%`,
                  }"
                ></span></span></span
          ></label>
          <p
            v-if="officers.data.value && !shown.length"
            class="m-0 text-campus-muted text-[11px]"
          >
            {{
              ordered.length
                ? "No active Maintenance Officer matches that name."
                : "There are no active Maintenance Officers."
            }}
          </p>
        </fieldset>
        <p
          v-if="choiceError"
          id="officer-error"
          class="mt-1.5 mb-0 text-error text-[11px] leading-[1.6]"
          aria-live="polite"
        >
          {{ choiceError }}
        </p>
      </div>
      <div class="grid gap-2 pt-3 px-5 pb-4.5 border-t border-campus-panel">
        <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <SubmitButton
            compact
            class="pr-8"
            :pending="assign.isPending.value"
            >{{ verb }}</SubmitButton><button
            type="button"
            class="py-2 px-0.5 text-[12px] underline underline-offset-4"
            @click="close"
          >
            Cancel
          </button>
        </div>
        <p
          v-if="formError"
          class="m-0 text-error text-[11px] leading-[1.6]"
          role="alert"
        >
          {{ formError }}
        </p>
      </div>
    </form>
  </dialog>
</template>
