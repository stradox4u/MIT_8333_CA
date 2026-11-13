<script setup lang="ts">
import ListChecks from "~icons/lucide/list-checks";
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
        <template v-if="item.assignment">{{
          item.assignment.officer.name
        }}</template
        ><span v-else class="muted">None</span>
      </template>
    </ServiceRequestList>
  </WorkspaceLayout>
</template>
