<script setup lang="ts">
import { computed, type Component } from "vue";
import { useQuery } from "@tanstack/vue-query";
import MapPin from "~icons/lucide/map-pin";
import LoadFailure from "./LoadFailure.vue";
import StatusChip from "./StatusChip.vue";
import PriorityTag from "./PriorityTag.vue";
import {
  serviceRequestsOptions,
  type Scope,
  type ListFilters,
  type ServiceRequestSummary,
} from "../service-requests/api";
import { formatShortDate } from "../service-requests/display";
import { useExpiredSession, isLoadFailure } from "../lib/expired-session";
const props = defineProps<{
  scope: Scope;
  filters: ListFilters;
  title: string;
  intro: string;
  href: string;
  linkLabel?: string;
  icon?: Component;
  primaryIcon?: boolean;
  attention?: boolean;
  answer?: boolean;
  priority?: boolean;
  empty: string;
}>();
defineSlots<{ side(props: { item: ServiceRequestSummary }): unknown }>();
const list = useQuery(
  computed(() => serviceRequestsOptions(props.scope, props.filters)),
);
useExpiredSession(list.error);
</script>
<template>
  <section
    class="min-w-0 py-5.5 px-6 phone:py-4.5 phone:px-3.75 border border-campus-gray rounded-[13px] bg-campus-surface"
    :aria-label="title"
    :class="
      attention
        ? 'border-campus-navy shadow-[0_0_0_1px_var(--color-campus-navy)_inset]'
        : ''
    "
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4.5">
      <span
        v-if="icon"
        class="grid place-items-center w-9 h-9 shrink-0 rounded-[10px]"
        :class="
          attention
            ? 'bg-campus-green phone:hidden'
            : primaryIcon
              ? 'bg-campus-green'
              : 'bg-campus-panel'
        "
        ><component :is="icon" class="w-4.5 h-4.5" aria-hidden="true"
      /></span>
      <div class="min-w-0 flex-1">
        <h2>{{ title }}</h2>
        <p class="m-0 mt-1 text-campus-muted text-[12px] leading-relaxed">
          {{ intro }}
        </p>
      </div>
      <RouterLink
        :to="href"
        class="text-[12px] font-semibold text-campus-navy underline underline-offset-3"
        :class="answer ? 'phone:basis-full' : ''"
        >{{ linkLabel ?? "View all"
        }}<template v-if="!linkLabel && list.data.value">
          ({{ list.data.value.total }})</template
        ></RouterLink
      >
    </div>
    <LoadFailure
      v-if="isLoadFailure(list.error.value)"
      :title="`We couldn’t load ${title}`"
      :pending="list.isFetching.value"
      @retry="list.refetch()"
    />
    <p
      v-else-if="list.isPending.value"
      class="text-[12px] text-campus-muted"
      role="status"
      aria-busy="true"
    >
      Loading Service Requests…
    </p>
    <p
      v-else-if="!list.data.value?.items.length"
      class="my-5 text-[12px] text-campus-muted"
      role="status"
    >
      {{ empty }}
    </p>
    <ul v-else class="m-0 p-0 list-none" :class="answer ? 'grid gap-2' : ''">
      <li
        v-for="item in list.data.value.items"
        :key="item.reference"
        class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
        :class="
          answer
            ? 'py-2.75 px-3.25 rounded-[9px] bg-white border border-campus-gray phone:grid-cols-1'
            : 'py-3 border-t border-campus-panel first:border-t-0 first:pt-0.5'
        "
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5 mb-1">
            <span class="font-mono text-[12px] font-semibold">{{
              item.reference
            }}</span
            ><StatusChip :status="item.status" /><PriorityTag
              v-if="priority && item.priority"
              :priority="item.priority"
            />
          </div>
          <RouterLink
            :to="`/requests/${encodeURIComponent(item.reference)}`"
            class="text-campus-navy text-[14px] font-semibold no-underline wrap-anywhere hover:underline"
            >{{ item.title }}</RouterLink
          ><span
            class="block mt-0.5 text-campus-muted text-[11px] wrap-anywhere"
            ><MapPin
              class="inline-block w-3 h-3 align-[-2px]"
              aria-hidden="true"
            />
            {{ item.location }} · Submitted
            {{ formatShortDate(item.submittedAt) }}</span
          >
        </div>
        <div
          class="grid justify-items-end gap-1.5 text-[11px] text-campus-muted"
          :class="answer ? 'phone:justify-items-stretch' : ''"
        >
          <slot name="side" :item="item" />
        </div>
      </li>
    </ul>
  </section>
</template>
