<script setup lang="ts">
import Inbox from "~icons/lucide/inbox";
import Plus from "~icons/lucide/plus";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import ListHeading from "../components/ListHeading.vue";
import ServiceRequestList from "../components/ServiceRequestList.vue";
</script>
<template>
  <WorkspaceLayout width="wide">
    <ListHeading
      eyebrow="Service Requests you’ve reported"
      title="My requests"
      intro="Follow each fault you’ve reported until it’s fixed."
    />
    <ServiceRequestList scope="requested" label="My requests">
      <template #empty>
        <span
          class="w-11.5 h-11.5 grid place-items-center bg-campus-green border border-campus-navy rounded-[13px] mt-0 mx-auto mb-4"
          ><Inbox class="inline-block flex-none w-5.5 h-5.5" aria-hidden="true"
        /></span>
        <h2>You haven’t reported any faults yet</h2>
        <p>
          When something on campus needs fixing, report it here and follow it
          until it’s fixed.
        </p>
        <RouterLink
          to="/requests/new"
          class="inline-flex relative items-center justify-center gap-2.5 min-h-11.75 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline bg-campus-green hover:brightness-97 w-auto phone:w-full"
          ><Plus
            class="inline-block flex-none align-[-3px] w-3.75 h-3.75"
            aria-hidden="true"
          />Report a fault</RouterLink
        >
      </template>
    </ServiceRequestList>
  </WorkspaceLayout>
</template>
