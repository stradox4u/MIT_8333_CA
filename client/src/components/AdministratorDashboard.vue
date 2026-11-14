<script setup lang="ts">
import UserRoundPlus from "~icons/lucide/user-round-plus";
import TriangleAlert from "~icons/lucide/triangle-alert";
import Shapes from "~icons/lucide/shapes";
import { ref } from "vue";
import DashboardSummary from "./DashboardSummary.vue";
import DashboardStats from "./DashboardStats.vue";
import DashboardRequestList from "./DashboardRequestList.vue";
import AssignPicker from "./AssignPicker.vue";
import PageNotice from "./PageNotice.vue";
import CategoryTag from "./CategoryTag.vue";
import {
  STATUSES,
  type ServiceRequestSummary,
  type ServiceRequestDetails,
  type MaintenanceOfficer,
} from "../service-requests/api";
import { statusIcons, statusNames } from "../service-requests/display";
const hints = {
  submitted: "Waiting for an Assignment",
  assigned: "Not started",
  in_progress: "Being worked on",
  completed: "Waiting for the Requester",
  verified: "Marked as Verified",
  cancelled: "Withdrawn",
};
const assigning = ref<ServiceRequestSummary | null>(null);
const notice = ref("");
function assigned(details: ServiceRequestDetails, officer: MaintenanceOfficer) {
  notice.value = `${details.reference} assigned to ${officer.name}. It’s now Assigned.`;
}
</script>
<template>
  <PageNotice v-if="notice" :message="notice" />
  <DashboardSummary scope="all" v-slot="{ summary }">
    <DashboardStats
      label="Service Requests by Status"
      :tiles="
        STATUSES.map((status) => ({
          label: statusNames[status],
          value: summary.byStatus[status],
          href: `/admin/requests?status=${status}`,
          icon: statusIcons[status],
          hint: hints[status],
          attention: status === 'submitted' && summary.byStatus.submitted > 0,
        }))
      "
    />
    <div class="grid grid-cols-2 tablet:grid-cols-1 gap-4.5 items-start">
      <DashboardRequestList
        scope="all"
        :filters="{
          status: 'submitted',
          sort: 'priority',
          page: 1,
          pageSize: 5,
        }"
        title="Waiting for an Assignment"
        :icon="UserRoundPlus"
        primary-icon
        intro="Submitted, by Priority, then the longest waiting."
        href="/admin/requests?status=submitted&sort=priority"
        priority
        empty="Nothing is waiting. Every Open request has a Maintenance Officer."
      >
        <template #side="{ item }"
          ><button
            type="button"
            class="inline-flex items-center justify-center min-h-8.5 py-1.5 px-2.75 border border-campus-navy rounded-[7px] bg-campus-green text-[11px] font-semibold hover:brightness-97"
            :aria-label="`Assign ${item.reference}`"
            @click="
              notice = '';
              assigning = item;
            "
          >
            Assign
          </button></template
        >
      </DashboardRequestList>
      <DashboardRequestList
        scope="all"
        :filters="{
          status: 'open',
          priority: 'urgent',
          sort: 'priority',
          page: 1,
          pageSize: 5,
        }"
        title="Urgent Open requests"
        :icon="TriangleAlert"
        intro="Oldest submissions first."
        href="/admin/requests?status=open&priority=urgent&sort=priority"
        empty="No Urgent requests are Open."
      >
        <template #side="{ item }"
          ><span class="wrap-anywhere">{{
            item.assignment?.officer.name ?? "Not assigned"
          }}</span></template
        >
      </DashboardRequestList>
    </div>
    <section
      class="mt-4.5 p-6 phone:py-4.75 phone:px-3.75 border border-campus-gray rounded-[13px] bg-campus-surface"
      aria-label="Open requests by Request Category"
    >
      <div class="flex items-center gap-3 mb-4.5">
        <span
          class="grid place-items-center w-9 h-9 shrink-0 rounded-[10px] bg-campus-panel"
          ><Shapes class="w-4.5 h-4.5" aria-hidden="true"
        /></span>
        <div>
          <h2>Open requests by Request Category</h2>
          <p class="m-0 mt-0.5 text-[12px] text-campus-muted">
            Submitted, Assigned and In Progress:
            {{
              summary.byStatus.submitted +
              summary.byStatus.assigned +
              summary.byStatus.in_progress
            }}
            in all.
          </p>
        </div>
      </div>
      <ul class="m-0 p-0 list-none">
        <li
          v-for="entry in summary.openByCategory
            ?.slice()
            .sort((a, b) => b.count - a.count)"
          :key="entry.category.id"
          class="grid grid-cols-[170px_minmax(0,1fr)] phone:grid-cols-1 items-center gap-x-3 gap-y-1 py-1.5 px-1 rounded-md hover:bg-campus-panel focus-within:bg-campus-panel text-[12px]"
        >
          <RouterLink
            :to="`/admin/requests?status=open&category=${entry.category.id}`"
            class="text-campus-navy underline underline-offset-3"
            ><CategoryTag :category="entry.category"
          /></RouterLink>
          <div class="flex items-center gap-2 min-w-0">
            <span
              v-if="entry.count"
              class="block h-4 bg-campus-navy rounded-r-sm max-w-[86%]"
              :style="{
                width: `${(entry.count / Math.max(1, ...(summary.openByCategory ?? []).map((row) => row.count))) * 86}%`,
              }"
              aria-hidden="true"
            ></span
            ><strong>{{ entry.count.toLocaleString("en-GB") }}</strong>
          </div>
        </li>
      </ul>
    </section>
  </DashboardSummary>
  <AssignPicker
    v-if="assigning"
    :request="assigning"
    @close="assigning = null"
    @assigned="assigned"
  />
</template>
