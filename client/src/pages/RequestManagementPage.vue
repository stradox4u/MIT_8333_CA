<script setup lang="ts">
import { ref } from "vue";
import ListChecks from "~icons/lucide/list-checks";
import UserRoundPlus from "~icons/lucide/user-round-plus";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ListHeading from "../components/ListHeading.vue";
import PageNotice from "../components/PageNotice.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
import AssignPicker from "../components/AssignPicker.vue";
import type {
  MaintenanceOfficer,
  ServiceRequestDetails,
  ServiceRequestSummary,
} from "../service-requests/api";

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
    />
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
          <UserRoundPlus class="inline-block w-3.75 h-3.75" aria-hidden="true" />Assign
        </button>
        <template v-else-if="item.assignment">{{
          item.assignment.officer.name
        }}</template
        ><span v-else class="text-campus-muted">None</span>
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
