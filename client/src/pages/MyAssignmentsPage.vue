<script setup lang="ts">
import ClipboardList from "~icons/lucide/clipboard-list";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ListHeading from "../components/ListHeading.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
</script>
<template>
  <WorkspaceLayout width="wide">
    <ListHeading
      eyebrow="Maintenance Officer"
      title="My assignments"
      intro="Service Requests you’re assigned to, and ones you’ve worked on before."
    />
    <ServiceRequestList scope="assigned" label="My assignments">
      <template #empty>
        <span
          class="w-11.5 h-11.5 grid place-items-center bg-campus-panel border border-campus-navy rounded-[13px] mt-0 mx-auto mb-4"
          ><ClipboardList
            class="inline-block flex-none w-5.5 h-5.5"
            aria-hidden="true"
        /></span>
        <h2>No Assignments yet</h2>
        <p>When an Administrator gives you an Assignment, it appears here.</p>
      </template>
    </ServiceRequestList>
  </WorkspaceLayout>
</template>
