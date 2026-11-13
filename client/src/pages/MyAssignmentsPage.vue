<script setup lang="ts">
import ClipboardList from "~icons/lucide/clipboard-list";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
</script>
<template>
  <WorkspaceLayout width="wide">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Maintenance Officer</p>
        <h1>My assignments</h1>
        <p class="intro">
          Service Requests you’re assigned to, and ones you’ve worked on before.
        </p>
      </div>
    </div>
    <ServiceRequestList scope="assigned" label="My assignments">
      <template #empty>
        <span class="state-icon quiet"
          ><ClipboardList class="icon" aria-hidden="true"
        /></span>
        <h2>No Assignments yet</h2>
        <p>When an Administrator gives you an Assignment, it appears here.</p>
      </template>
    </ServiceRequestList>
  </WorkspaceLayout>
</template>
