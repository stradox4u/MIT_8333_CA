<script setup lang="ts">
import CircleDashed from "~icons/lucide/circle-dashed";
import CircleCheck from "~icons/lucide/circle-check";
import BadgeCheck from "~icons/lucide/badge-check";
import History from "~icons/lucide/history";
import Plus from "~icons/lucide/plus";
import DashboardSummary from "./DashboardSummary.vue";
import DashboardStats from "./DashboardStats.vue";
import DashboardRequestList from "./DashboardRequestList.vue";
import CampusArt from "./CampusArt.vue";
const reportButton =
  "inline-flex items-center justify-center gap-2.5 min-h-10.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] bg-campus-green text-campus-navy text-[12px] font-semibold no-underline hover:brightness-97";
</script>
<template>
  <DashboardSummary scope="requested" v-slot="{ summary }">
    <template v-if="Object.values(summary.byStatus).some(Boolean)">
      <DashboardRequestList
        v-if="summary.byStatus.completed"
        class="mb-4.5"
        attention
        answer
        :icon="CircleCheck"
        scope="requested"
        :filters="{ status: 'completed', sort: 'newest', page: 1, pageSize: 5 }"
        :title="`${summary.byStatus.completed} Completed ${summary.byStatus.completed === 1 ? 'request needs' : 'requests need'} your answer`"
        intro="Tell us whether each fault is fixed. If you don’t answer within 7 days, it becomes Verified automatically."
        href="/requests?status=completed"
        link-label="All awaiting answers"
        empty="You’re all caught up."
      >
        <template #side="{ item }"
          ><RouterLink
            :to="`/requests/${item.reference}`"
            :aria-label="`Answer for ${item.reference}`"
            :class="reportButton"
            class="px-4"
            >Answer →</RouterLink
          ></template
        >
      </DashboardRequestList>
      <DashboardStats
        label="Your requests by Status"
        :tiles="[
          {
            label: 'Open requests',
            value:
              summary.byStatus.submitted +
              summary.byStatus.assigned +
              summary.byStatus.in_progress,
            href: '/requests?status=open',
            icon: CircleDashed,
            hint: `${summary.byStatus.submitted} Submitted · ${summary.byStatus.assigned} Assigned · ${summary.byStatus.in_progress} In Progress`,
          },
          {
            label: 'Waiting for your answer',
            value: summary.byStatus.completed,
            href: '/requests?status=completed',
            icon: CircleCheck,
            hint: 'Completed, needs Fixed or Not fixed',
            attention: summary.byStatus.completed > 0,
          },
          {
            label: 'Verified',
            value: summary.byStatus.verified,
            href: '/requests?status=verified',
            icon: BadgeCheck,
            hint: 'Fixed and closed',
          },
        ]"
      />
      <div
        class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] tablet:grid-cols-1 gap-4.5 items-start"
      >
        <DashboardRequestList
          scope="requested"
          :filters="{ sort: 'newest', page: 1, pageSize: 5 }"
          title="Recent requests"
          :icon="History"
          intro="Newest submissions first."
          href="/requests"
          link-label="All my requests"
          empty="Nothing reported yet."
        />
        <section
          class="p-6 phone:py-4.75 phone:px-3.75 border border-campus-gray rounded-[13px] bg-campus-surface"
          aria-labelledby="report-title"
        >
          <CampusArt class="w-full max-w-85 mx-auto" />
          <h2 id="report-title" class="mt-1.5 mb-1.5">Something broken?</h2>
          <p class="text-campus-muted text-[12px] mb-4">
            Report it in a minute and follow it until it’s fixed.
          </p>
          <RouterLink to="/requests/new" :class="reportButton" class="w-full"
            ><Plus class="w-4 h-4" aria-hidden="true" />Report a
            fault</RouterLink
          >
        </section>
      </div>
    </template>
    <section
      v-else
      class="grid grid-cols-[minmax(0,1fr)_190px] phone:grid-cols-1 items-center gap-4 p-6 border border-campus-gray rounded-[13px] bg-campus-surface"
      aria-labelledby="first-title"
    >
      <div>
        <h2 id="first-title" class="text-[20px] mb-2">Nothing reported yet</h2>
        <p class="intro text-[13px] mb-4.5">
          Found a leaking pipe, a faulty socket or broken furniture? Report it
          in a minute.
        </p>
        <RouterLink to="/requests/new" :class="reportButton"
          ><Plus class="w-4 h-4" aria-hidden="true" />Report a fault</RouterLink
        >
      </div>
      <CampusArt class="w-full max-w-100 mx-auto phone:hidden" />
    </section>
  </DashboardSummary>
</template>
