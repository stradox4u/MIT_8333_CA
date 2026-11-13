<script setup lang="ts">
import { ref } from "vue";
import ListChecks from "~icons/lucide/list-checks";
import UserRoundPlus from "~icons/lucide/user-round-plus";
import type { ServiceRequestSummary } from "../service-requests/api";

/** The request the assign picker is open for. */
const assigning = ref<ServiceRequestSummary | null>(null);
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
</script>
<template>
  <WorkspaceLayout width="wide">
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
          @click="assigning = item"
        >
          <UserRoundPlus class="icon" aria-hidden="true" />Assign
        </button>
        <template v-else-if="item.assignment">{{
          item.assignment.officer.name
        }}</template
        ><span v-else class="muted">None</span>
      </template>
    </ServiceRequestList>
  </WorkspaceLayout>
</template>
