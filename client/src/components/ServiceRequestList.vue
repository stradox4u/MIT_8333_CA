<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import MapPin from "~icons/lucide/map-pin";
import Search from "~icons/lucide/search";
import Lock from "~icons/lucide/lock";
import LoadFailure from "./LoadFailure.vue";
import StatusChip from "./StatusChip.vue";
import CategoryTag from "./CategoryTag.vue";
import PriorityTag from "./PriorityTag.vue";
import ListPagination from "./ListPagination.vue";
import { meOptions } from "../auth/identity";
import { isLoadFailure, useExpiredSession } from "../lib/expired-session";
import {
  PAGE_SIZE,
  STATUSES,
  serviceRequestsOptions,
  type ListFilters,
  type Scope,
  type ServiceRequestSummary,
  type StatusFilter,
} from "../service-requests/api";
import { formatShortDate, statusNames } from "../service-requests/display";

/**
 * A page of Service Requests in one scope, with the Status filter and the
 * page in the URL. The page around it gives the heading and the empty state.
 */
const props = defineProps<{
  scope: Scope;
  /** Names the list for assistive technology, such as "My requests". */
  label: string;
}>();
defineSlots<{
  /** Shown when the scope holds no Service Requests at all. */
  empty(): unknown;
  /** The Maintenance Officer cell of Request management. */
  officer(props: { item: ServiceRequestSummary }): unknown;
}>();

const route = useRoute();
const router = useRouter();
const me = useQuery(meOptions);

const statusFilters: StatusFilter[] = ["open", ...STATUSES];
const isStatusFilter = (value: unknown): value is StatusFilter =>
  statusFilters.includes(value as StatusFilter);

/** The filters and page live in the URL, so Back and shared links keep them. */
const filters = computed<ListFilters>(() => {
  const status = route.query.status;
  return {
    ...(isStatusFilter(status) ? { status } : {}),
    page: pageFrom(route.query.page),
  };
});
/** Only a plain whole number names a page; anything else, such as 1e21, is page 1. */
function pageFrom(value: unknown) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}
/** A new filter starts again at page 1. */
function filterByStatus(event: Event) {
  const status = (event.target as HTMLSelectElement).value;
  void router.push({ query: status ? { status } : {} });
}
const list = useQuery(
  computed(() => serviceRequestsOptions(props.scope, filters.value)),
);
useExpiredSession(list.error);

const pages = computed(() =>
  Math.max(
    1,
    Math.ceil(
      (list.data.value?.total ?? 0) / (list.data.value?.pageSize ?? PAGE_SIZE),
    ),
  ),
);
const range = computed(() => {
  const data = list.data.value;
  if (!data) return { first: 0, last: 0 };
  const first = (data.page - 1) * data.pageSize + 1;
  return { first, last: first + data.items.length - 1 };
});
const plural = (count: number) =>
  count === 1 ? "Service Request" : "Service Requests";
/**
 * Nothing to show yet. While a new filter loads, the previous answer's rows
 * stay on screen, but its emptiness doesn't pick an empty state.
 */
const loading = computed(
  () =>
    list.isPending.value ||
    (list.isPlaceholderData.value && !list.data.value?.items.length),
);
/** A page asked for in the URL that the list doesn't reach. */
const pastTheEnd = computed(
  () =>
    !!list.data.value &&
    !list.data.value.items.length &&
    list.data.value.total > 0,
);

/** An Assignment the officer no longer holds: they can read it, not act on it. */
const readOnly = (item: ServiceRequestSummary) =>
  props.scope === "assigned" && item.assignment?.officer.id !== me.data.value?.id;
const href = (item: ServiceRequestSummary) =>
  `/requests/${encodeURIComponent(item.reference)}`;

/** After choosing a page, move to the summary of the rows it brought. */
const summaryElement = ref<HTMLElement | null>(null);
let focusSummary = false;
watch(
  () => list.data.value?.page,
  async () => {
    if (!focusSummary || list.isPlaceholderData.value) return;
    focusSummary = false;
    await nextTick();
    summaryElement.value?.focus();
  },
);
</script>
<template>
  <form class="toolbar" :aria-label="`Filter ${label}`" @submit.prevent>
    <div class="field sr-field select-field">
      <label for="status">Status</label>
      <select
        id="status"
        class="select"
        name="status"
        :value="filters.status ?? ''"
        @change="filterByStatus"
      >
        <option value="">Any Status</option>
        <option value="open">Open (Submitted, Assigned, In Progress)</option>
        <option v-for="status in STATUSES" :key="status" :value="status">
          {{ statusNames[status] }}
        </option>
      </select>
    </div>
  </form>
  <LoadFailure
    v-if="isLoadFailure(list.error.value)"
    class="empty-state"
    :title="
      scope === 'requested'
        ? 'We couldn’t load your Service Requests'
        : `We couldn’t load ${label}`
    "
    :pending="list.isFetching.value"
    @retry="list.refetch()"
  />
  <div v-else-if="loading" class="table-wrap" aria-busy="true">
    <p class="visually-hidden" role="status">Loading Service Requests…</p>
    <div v-for="row in 5" :key="row" class="skeleton-row">
      <span class="skeleton"></span><span class="skeleton"></span
      ><span class="skeleton"></span><span class="skeleton"></span>
    </div>
  </div>
  <div
    v-else-if="list.data.value?.total === 0 && filters.status"
    class="empty-state"
    role="status"
  >
    <span class="state-icon quiet"
      ><Search class="icon" aria-hidden="true"
    /></span>
    <h2>No Service Requests match</h2>
    <p>Try a different Status, or clear the filter.</p>
    <button
      type="button"
      class="button button-outline compact-button"
      @click="router.push({ query: {} })"
    >
      Clear the filter
    </button>
  </div>
  <div v-else-if="list.data.value?.total === 0" class="empty-state">
    <slot name="empty" />
  </div>
  <div v-else-if="pastTheEnd" class="empty-state">
    <h2>There’s no page {{ filters.page }}</h2>
    <p>The list has {{ pages }} {{ pages === 1 ? "page" : "pages" }}.</p>
    <RouterLink
      :to="{
        query: { ...route.query, page: pages > 1 ? String(pages) : undefined },
      }"
      class="button button-outline compact-button"
      :aria-current="undefined"
      >Go to page {{ pages }}</RouterLink
    >
  </div>
  <template v-else-if="list.data.value">
    <div class="list-summary">
      <p id="results-summary" ref="summaryElement" tabindex="-1" role="status">
        Showing <strong>{{ range.first }}–{{ range.last }}</strong> of
        <strong>{{ list.data.value.total.toLocaleString("en-GB") }}</strong>
        {{ plural(list.data.value.total) }}
      </p>
    </div>
    <div class="table-wrap">
      <table class="sr-table">
        <caption class="visually-hidden">
          {{ label }}, page
          {{ list.data.value.page }}
          of
          {{ pages }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Service Request</th>
            <th v-if="scope !== 'assigned'" scope="col" class="hide-md">
              Request Category
            </th>
            <th v-if="scope !== 'requested'" scope="col">Priority</th>
            <th scope="col">Status</th>
            <th v-if="scope !== 'requested'" scope="col" class="hide-md">
              Requester
            </th>
            <th v-if="scope === 'all'" scope="col">Maintenance Officer</th>
            <th scope="col">Submitted</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list.data.value.items" :key="item.reference">
            <td><span class="ref">{{ item.reference }}</span></td>
            <td class="title-cell">
              <RouterLink :to="href(item)" class="row-link">{{
                item.title
              }}</RouterLink
              ><span class="row-sub"
                ><MapPin class="icon" aria-hidden="true" />
                {{ item.location }}</span
              >
            </td>
            <td v-if="scope !== 'assigned'" class="hide-md">
              <CategoryTag :category="item.category" />
            </td>
            <td v-if="scope !== 'requested'">
              <PriorityTag v-if="item.priority" :priority="item.priority" /><template
                v-else
                ><span class="muted" aria-hidden="true">—</span
                ><span class="visually-hidden">Not shown</span></template
              >
            </td>
            <td>
              <div class="status-cell">
                <StatusChip :status="item.status" /><span
                  v-if="readOnly(item)"
                  class="tag outline"
                  ><Lock class="icon" aria-hidden="true" />Reassigned · read
                  only</span
                >
              </div>
            </td>
            <td v-if="scope !== 'requested'" class="hide-md">
              {{ item.requester.name }}
            </td>
            <td v-if="scope === 'all'">
              <slot name="officer" :item="item" />
            </td>
            <td>
              <time class="num" :datetime="item.submittedAt">{{
                formatShortDate(item.submittedAt)
              }}</time>
            </td>
          </tr>
        </tbody>
      </table>
      <ul class="card-list" :aria-label="label">
        <li
          v-for="item in list.data.value.items"
          :key="item.reference"
          class="request-card"
        >
          <div class="card-top">
            <span class="ref">{{ item.reference }}</span
            ><span class="card-flags"
              ><StatusChip :status="item.status" /><span
                v-if="readOnly(item)"
                class="tag outline"
                ><Lock class="icon" aria-hidden="true" />Reassigned · read
                only</span
              ></span
            >
          </div>
          <RouterLink :to="href(item)" class="row-link stretched">{{
            item.title
          }}</RouterLink
          ><span class="row-sub"
            ><MapPin class="icon" aria-hidden="true" />
            {{ item.location }}</span
          >
          <div class="card-meta">
            <CategoryTag :category="item.category" /><PriorityTag
              v-if="scope !== 'requested' && item.priority"
              :priority="item.priority"
            /><span
              >Submitted
              <time :datetime="item.submittedAt">{{
                formatShortDate(item.submittedAt)
              }}</time></span
            ><span v-if="scope !== 'requested'"
              >Requester: {{ item.requester.name }}</span
            ><span v-if="scope === 'all' && item.assignment"
              >Officer: {{ item.assignment.officer.name }}</span
            >
          </div>
          <div
            v-if="scope === 'all' && item.status === 'submitted'"
            class="card-actions above-stretch"
          >
            <slot name="officer" :item="item" />
          </div>
        </li>
      </ul>
    </div>
    <ListPagination
      :page="list.data.value.page"
      :pages="pages"
      @navigate="focusSummary = true"
    />
  </template>
</template>
