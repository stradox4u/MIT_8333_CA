<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import LoadFailure from "./LoadFailure.vue";
import {
  serviceRequestsSummaryOptions,
  type DashboardSummary,
  type Scope,
} from "../service-requests/api";
import { isLoadFailure, useExpiredSession } from "../lib/expired-session";
const props = defineProps<{ scope: Scope }>();
defineSlots<{ default(props: { summary: DashboardSummary }): unknown }>();
const summary = useQuery(
  computed(() => serviceRequestsSummaryOptions(props.scope)),
);
useExpiredSession(summary.error);
</script>
<template>
  <LoadFailure
    v-if="isLoadFailure(summary.error.value)"
    class="py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center [&_.state-icon]:mt-0 [&_.state-icon]:mx-auto [&_.state-icon]:mb-4 [&_h2]:mb-1.5 [&_p]:max-w-105 [&_p]:mt-0 [&_p]:mx-auto [&_p]:mb-4.5 [&_p]:text-campus-muted [&_p]:text-[12px] [&_p]:leading-[1.65] [&_.button]:w-auto phone:[&_.button]:w-full"
    title="We couldn’t load your dashboard"
    :pending="summary.isFetching.value"
    @retry="summary.refetch()"
  />
  <div
    v-else-if="summary.isPending.value"
    class="grid grid-cols-3 phone:grid-cols-2 gap-3"
    aria-busy="true"
  >
    <p class="sr-only" role="status">Loading your dashboard…</p>
    <div
      v-for="n in 3"
      :key="n"
      class="h-26 border border-campus-gray rounded-xl bg-campus-surface motion-safe:animate-pulse"
    ></div>
  </div>
  <slot v-else-if="summary.data.value" :summary="summary.data.value" />
</template>
