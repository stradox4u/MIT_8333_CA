<script setup lang="ts">
import ClipboardList from "~icons/lucide/clipboard-list";
import { useQuery } from "@tanstack/vue-query";
import DashboardSummary from "./DashboardSummary.vue";
import DashboardStats from "./DashboardStats.vue";
import DashboardRequestList from "./DashboardRequestList.vue";
import { meOptions } from "../auth/identity";
import { statusNames, statusIcons } from "../service-requests/display";
const me = useQuery(meOptions);
const statuses = ["assigned", "in_progress", "completed", "verified"] as const;
const hints = {
  assigned: "Not started yet",
  in_progress: "You’ve started",
  completed: "Waiting for the Requester",
  verified: "Fixed and closed",
};
</script>
<template>
  <DashboardSummary scope="assigned" v-slot="{ summary }">
    <DashboardStats
      label="Your Assignments by Status"
      :tiles="
        statuses.map((status) => ({
          label: statusNames[status],
          value: summary.byStatus[status],
          href: `/assignments?status=${status}`,
          icon: statusIcons[status],
          hint: hints[status],
          attention: status === 'assigned' && summary.byStatus.assigned > 0,
        }))
      "
    />
    <DashboardRequestList
      v-if="me.data.value"
      scope="assigned"
      :filters="{
        officerId: me.data.value.id,
        status: 'open',
        sort: 'priority',
        page: 1,
        pageSize: 5,
      }"
      title="Current Assignments"
      :icon="ClipboardList"
      intro="Assigned and In Progress, by Priority, then the longest waiting."
      href="/assignments"
      link-label="All my assignments"
      priority
      empty="No current Assignments. New ones appear here when an Administrator assigns you."
    >
      <template #side="{ item }"
        ><RouterLink
          :to="`/requests/${item.reference}`"
          :aria-label="`${item.status === 'assigned' ? 'Start' : 'Open'} ${item.reference}`"
          class="inline-flex items-center justify-center min-h-8.5 py-1.5 px-2.75 border border-campus-navy rounded-[7px] text-[11px] font-semibold text-campus-navy no-underline hover:bg-campus-panel"
          >{{ item.status === "assigned" ? "Start" : "Open" }}</RouterLink
        ></template
      >
    </DashboardRequestList>
  </DashboardSummary>
</template>
