<script setup lang="ts">
import { nextTick, ref } from "vue";
import ListChecks from "~icons/lucide/list-checks";
import UserRoundPlus from "~icons/lucide/user-round-plus";
import CircleCheck from "~icons/lucide/circle-check";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
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
const noticeElement = ref<HTMLElement | null>(null);
async function assigned(
  details: ServiceRequestDetails,
  officer: MaintenanceOfficer,
) {
  notice.value = `${details.reference} assigned to ${officer.name}. It’s now Assigned.`;
  await nextTick();
  noticeElement.value?.focus();
}
</script>
<template>
  <WorkspaceLayout width="wide">
    <p
      v-if="notice"
      ref="noticeElement"
      class="feedback success page-feedback"
      role="status"
      tabindex="-1"
    >
      <CircleCheck class="icon" aria-hidden="true" /><span>{{ notice }}</span>
    </p>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Administrator</p>
        <h1>Request management</h1>
        <p class="intro">
          Every Service Request on campus. Assign Submitted ones straight from
          the list.
        </p>
      </div>
    </div>
    <ServiceRequestList scope="all" label="Request management">
      <template #empty>
        <span class="state-icon quiet"
          ><ListChecks class="icon" aria-hidden="true"
        /></span>
        <h2>No Service Requests yet</h2>
        <p>Requests appear here as soon as anyone reports a fault.</p>
      </template>
      <template #officer="{ item }">
        <button
          v-if="item.status === 'submitted'"
          type="button"
          class="button button-primary button-small"
          :aria-label="`Assign ${item.reference}`"
          @click="
            notice = '';
            assigning = item;
          "
        >
          <UserRoundPlus class="icon" aria-hidden="true" />Assign
        </button>
        <template v-else-if="item.assignment">{{
          item.assignment.officer.name
        }}</template
        ><span v-else class="muted">None</span>
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
