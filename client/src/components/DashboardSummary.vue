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
