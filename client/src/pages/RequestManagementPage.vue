<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import Download from "~icons/lucide/download";
import ListChecks from "~icons/lucide/list-checks";
import UserRoundPlus from "~icons/lucide/user-round-plus";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ListHeading from "../components/ListHeading.vue";
import PageNotice from "../components/PageNotice.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
import AssignPicker from "../components/AssignPicker.vue";
import {
  exportCsvHref,
  serviceRequestsOptions,
  type MaintenanceOfficer,
  type ServiceRequestDetails,
  type ServiceRequestSummary,
} from "../service-requests/api";
import { readListFilters } from "../service-requests/list-filters";

/** The export follows the list's committed URL filters, so a pending search stays out. */
const route = useRoute();
const filters = computed(() => readListFilters(route.query, "all"));
const exportHref = computed(() => exportCsvHref(filters.value));
// Shares the list's cached page, so it adds no request.
const list = useQuery(
  computed(() => serviceRequestsOptions("all", filters.value)),
);
const exportHint = computed(() => {
  const total = list.data.value?.total;
  if (total === undefined) return "";
  if (!total) return "No matching requests to export";
  return `All ${total.toLocaleString("en-GB")} matching ${total === 1 ? "request" : "requests"}, not just this page`;
});

/** The request the assign picker is open for. */
const assigning = ref<ServiceRequestSummary | null>(null);
const notice = ref("");
function assigned(details: ServiceRequestDetails, officer: MaintenanceOfficer) {
  notice.value = `${details.reference} assigned to ${officer.name}. It’s now Assigned.`;
}
</script>
<template>
  <WorkspaceLayout width="wide">
    <PageNotice v-if="notice" :message="notice" />
    <ListHeading
      eyebrow="Administrator"
      title="Request management"
      intro="Every Service Request on campus. Assign Submitted ones straight from the list."
    >
      <div
        class="grid justify-items-end gap-3 phone:w-full phone:justify-items-stretch"
      >
        <a
          :href="exportHref"
          download
          class="inline-flex relative items-center justify-center gap-2 min-h-10 py-2 px-3.5 border border-campus-navy rounded-[7px] bg-transparent text-campus-navy text-[12px] font-semibold leading-[1.4] text-center no-underline whitespace-nowrap hover:bg-campus-surface"
          :aria-describedby="exportHint ? 'export-hint' : undefined"
          ><Download class="w-3.75 h-3.75" aria-hidden="true" />Export CSV</a
        >
        <p
          id="export-hint"
          class="min-h-4.5 m-0 text-campus-muted text-[11px] leading-[1.6]"
        >
          {{ exportHint }}
        </p>
      </div>
    </ListHeading>
    <ServiceRequestList scope="all" label="Request management">
      <template #empty>
        <span
          class="w-11.5 h-11.5 grid place-items-center bg-campus-panel border border-campus-navy rounded-[13px] mt-0 mx-auto mb-4"
          ><ListChecks
            class="inline-block flex-none w-5.5 h-5.5"
            aria-hidden="true"
        /></span>
        <h2>No Service Requests yet</h2>
        <p>Requests appear here as soon as anyone reports a fault.</p>
      </template>
      <template #officer="{ item }">
        <button
          v-if="item.status === 'submitted'"
          type="button"
          class="inline-flex items-center gap-2 min-h-8.5 py-1.5 px-2.75 border border-campus-navy rounded-[7px] bg-campus-green text-campus-navy text-[11px] font-semibold whitespace-nowrap enabled:hover:brightness-97"
          :aria-label="`Assign ${item.reference}`"
          @click="
            notice = '';
            assigning = item;
          "
        >
          <UserRoundPlus
            class="inline-block w-3.75 h-3.75"
            aria-hidden="true"
          />Assign
        </button>
        <template v-else-if="item.assignment">{{
          item.assignment.officer.name
        }}</template><span v-else class="text-campus-muted">None</span>
      </template>
    </ServiceRequestList>
    <AssignPicker
      v-if="assigning"
      :request="assigning"
      @close="assigning = null"
      @assigned="assigned"
    />
  </WorkspaceLayout>
</template>
