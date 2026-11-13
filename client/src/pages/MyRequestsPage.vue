<script setup lang="ts">
import Inbox from "~icons/lucide/inbox";
import Plus from "~icons/lucide/plus";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
</script>
<template>
  <WorkspaceLayout width="wide">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Service Requests you’ve reported</p>
        <h1>My requests</h1>
        <p class="intro">Follow each fault you’ve reported until it’s fixed.</p>
      </div>
    </div>
    <ServiceRequestList scope="requested" label="My requests">
      <template #empty>
        <span class="state-icon"
          ><Inbox class="icon" aria-hidden="true"
        /></span>
        <h2>You haven’t reported any faults yet</h2>
        <p>
          When something on campus needs fixing, report it here and follow it
          until it’s fixed.
        </p>
        <RouterLink to="/requests/new" class="button button-primary"
          ><Plus class="icon" aria-hidden="true" />Report a fault</RouterLink
        >
      </template>
    </ServiceRequestList>
  </WorkspaceLayout>
</template>
