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
    opener = null;
    dialog.value?.close();
    emit("assigned", details, officer);
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
    class="sheet"
    aria-labelledby="assign-title"
    @close="closed"
  >
    <form novalidate @submit.prevent="submit">
      <div class="sheet-head">
        <div>
          <h2 id="assign-title">{{ verb }} {{ request.reference }}</h2>
          <p>{{ request.title }} · {{ request.location }}</p>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="Close"
          @click="close"
        >
          <Close class="icon" aria-hidden="true" />
        </button>
      </div>
      <div class="sheet-body">
        <div class="field sr-field">
          <label for="officer-search">Find a Maintenance Officer</label>
          <div class="search-wrap">
            <Search class="icon" aria-hidden="true" /><input
              id="officer-search"
              ref="searchInput"
              v-model="search"
              class="input"
              type="search"
              autocomplete="off"
              placeholder="Name"
            />
          </div>
        </div>
        <fieldset
          class="officer-list"
          aria-describedby="officer-hint"
          :aria-invalid="choiceError ? true : undefined"
        >
          <legend class="visually-hidden">Maintenance Officer</legend>
          <p id="officer-hint" class="field-hint">
            Active Maintenance Officers, fewest Open Assignments first.
          </p>
          <p
            v-if="officers.isPending.value"
            class="field-hint"
            role="status"
          >
            Loading Maintenance Officers…
          </p>
          <div v-else-if="isLoadFailure(officers.error.value)" role="alert">
            <p class="field-error">
              We couldn’t load the Maintenance Officers.
            </p>
            <button
              type="button"
              class="row-action"
              @click="officers.refetch()"
            >
              Try again
            </button>
          </div>
          <label
            v-for="officer in shown"
            :key="officer.id"
            class="officer-option"
            ><input
              v-model="chosen"
              type="radio"
              name="officer"
              :value="officer.id"
              :disabled="officer.id === currentOfficerId"
              :aria-describedby="choiceError ? 'officer-error' : undefined"
              @change="choiceError = ''"
            /><span class="officer-name"
              >{{ officer.name
              }}<span
                v-if="officer.id === currentOfficerId"
                class="tag quiet"
                >Current officer</span
              ></span
            ><span class="officer-load"
              ><span>{{ load(officer.openAssignments) }}</span
              ><span class="meter" aria-hidden="true"
                ><span
                  :style="{
                    width: `${Math.round((officer.openAssignments / most) * 100)}%`,
                  }"
                ></span></span></span
          ></label>
          <p
            v-if="officers.data.value && !shown.length"
            class="field-hint"
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
          class="field-error"
          aria-live="polite"
        >
          {{ choiceError }}
        </p>
      </div>
      <div class="sheet-foot">
        <div class="actions-row">
          <SubmitButton
            class="compact-button has-request"
            :pending="assign.isPending.value"
            >{{ verb }}</SubmitButton
          ><button type="button" class="row-action" @click="close">
            Cancel
          </button>
        </div>
        <p v-if="formError" class="field-error form-error" role="alert">
          {{ formError }}
        </p>
      </div>
    </form>
  </dialog>
</template>
