<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
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
import RequestListFilters from "./RequestListFilters.vue";
import { useListFilters } from "../service-requests/list-filters";
import { formatShortDate, statusNames } from "../service-requests/display";

/** A page of Service Requests in one scope; the Status filter and page live in the URL. */
const props = defineProps<{
  scope: Scope;
  /** Names the list for assistive technology, such as "My requests". */
  label: string;
}>();
defineSlots<{
  /** Shown when the scope holds no Service Requests at all. */
  empty(): unknown;
  /** Request management's Maintenance Officer cell. */
  officer(props: { item: ServiceRequestSummary }): unknown;
}>();

const route = useRoute();
const router = useRouter();
const me = useQuery(meOptions);

const { filters, update: updateUrl } = useListFilters(() => props.scope);
function filterByStatus(event: Event) {
  update({
    status:
      ((event.target as HTMLSelectElement).value as StatusFilter) || undefined,
  });
}
const search = ref("");
let searchTimer: ReturnType<typeof setTimeout> | undefined;
function update(changes: Partial<ListFilters>) {
  clearTimeout(searchTimer);
  updateUrl({ search: search.value.trim() || undefined, ...changes });
}
watch(
  () => route.fullPath,
  () => {
    clearTimeout(searchTimer);
    search.value = filters.value.search ?? "";
  },
  { immediate: true },
);
function searchNow() {
  clearTimeout(searchTimer);
  const value = search.value.trim();
  if (value === (filters.value.search ?? "")) return;
  update({ search: value || undefined });
}
function searchSoon() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchNow, 300);
}
onBeforeUnmount(() => clearTimeout(searchTimer));
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
/** While a new filter loads, the previous answer's emptiness doesn't pick an empty state. */
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
  props.scope === "assigned" &&
  item.assignment?.officer.id !== me.data.value?.id;
const href = (item: ServiceRequestSummary) =>
  `/requests/${encodeURIComponent(item.reference)}`;

/** After choosing a page, move to the summary of the rows it brought. */
const summaryElement = ref<HTMLElement | null>(null);
let focusSummary = false;
watch(
  () => list.data.value?.page,
  async () => {
    if (!focusSummary || !list.data.value || list.isPlaceholderData.value)
      return;
    focusSummary = false;
    await nextTick();
    summaryElement.value?.focus();
  },
);

const box =
  "py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center";
const boxText =
  "max-w-105 mt-0 mx-auto mb-4.5 text-campus-muted text-[12px] leading-[1.65]";
const outlineButton =
  "inline-flex relative items-center justify-center gap-2.5 min-h-10.5 max-w-full w-auto py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline bg-transparent enabled:hover:bg-campus-panel phone:w-full";
const skeleton =
  "block h-3 rounded-md [background:linear-gradient(90deg,var(--color-campus-panel),#e7eded,var(--color-campus-panel))] bg-size-[200%_100%] animate-shimmer motion-reduce:animate-none";
const reference =
  "font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] font-semibold leading-[1.3] text-[12px] tracking-[0.02em] whitespace-nowrap";
const readOnlyTag =
  "inline-flex items-center gap-1 py-0.5 px-1.75 rounded text-[10px] font-[550] whitespace-nowrap shadow-[0_0_0_1px_var(--color-campus-control)_inset]";
</script>
<template>
  <form
    class="flex flex-wrap items-end gap-3 mb-3.5"
    :aria-label="`Filter ${label}`"
    @submit.prevent="searchNow"
  >
    <div class="min-w-0 grid gap-1.25 flex-[1_1_280px]">
      <label for="search" class="text-[12px] font-semibold">Search</label>
      <div class="relative">
        <Search class="absolute left-3 top-3.5 w-4 h-4" aria-hidden="true" />
        <input
          id="search"
          v-model="search"
          type="search"
          name="search"
          maxlength="200"
          autocomplete="off"
          :placeholder="
            scope === 'all'
              ? 'Reference, title, location or Requester'
              : 'Reference or title'
          "
          class="w-full min-w-0 h-11.5 pl-9 pr-3 border border-campus-control rounded-[7px] bg-campus-surface text-[14px] phone:text-[16px]"
          @input="searchSoon"
        />
      </div>
    </div>
    <div
      v-if="scope !== 'all'"
      class="min-w-0 grid gap-1.25 flex-[0_1_190px] phone:flex-[1_1_100%]"
    >
      <label class="block m-0 text-[12px] font-semibold" for="status"
        >Status</label
      >
      <select
        id="status"
        class="select bg-campus-surface w-full min-w-0 h-11.5 py-2.5 px-3 border border-campus-control rounded-[7px] text-campus-navy text-[14px] pr-8.5 appearance-none bg-no-repeat bg-position-[right_11px_center] phone:text-[16px]"
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
    <RequestListFilters
      v-if="scope === 'all'"
      :filters="filters"
      @update="update"
    />
  </form>
  <LoadFailure
    v-if="isLoadFailure(list.error.value)"
    class="py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center [&_.state-icon]:mt-0 [&_.state-icon]:mx-auto [&_.state-icon]:mb-4 [&_h2]:mb-1.5 [&_p]:max-w-105 [&_p]:mt-0 [&_p]:mx-auto [&_p]:mb-4.5 [&_p]:text-campus-muted [&_p]:text-[12px] [&_p]:leading-[1.65] [&_.button]:w-auto phone:[&_.button]:w-full"
    :title="
      scope === 'requested'
        ? 'We couldn’t load your Service Requests'
        : `We couldn’t load ${label}`
    "
    :pending="list.isFetching.value"
    @retry="list.refetch()"
  />
  <div
    v-else-if="loading"
    class="overflow-hidden border border-campus-gray rounded-xl bg-campus-surface"
    aria-busy="true"
  >
    <p class="sr-only" role="status">Loading Service Requests…</p>
    <div
      v-for="row in 5"
      :key="row"
      class="grid grid-cols-[90px_1fr_110px_90px] gap-4 py-4 px-3.5 border-b border-b-campus-panel"
    >
      <span :class="skeleton"></span><span :class="skeleton"></span
      ><span :class="skeleton"></span><span :class="skeleton"></span>
    </div>
  </div>
  <div
    v-else-if="
      list.data.value?.total === 0 &&
      Object.entries(filters).some(
        ([key, value]) => key !== 'page' && key !== 'sort' && value,
      )
    "
    :class="box"
    role="status"
  >
    <span
      class="w-11.5 h-11.5 grid place-items-center bg-campus-panel border border-campus-navy rounded-[13px] mt-0 mx-auto mb-4"
      ><Search class="inline-block flex-none w-5.5 h-5.5" aria-hidden="true"
    /></span>
    <h2 class="mb-1.5">No Service Requests match</h2>
    <p :class="boxText">Try a different search, or clear the filters.</p>
    <button
      type="button"
      :class="outlineButton"
      @click="router.push({ query: {} })"
    >
      Clear search and filters
    </button>
  </div>
  <div
    v-else-if="list.data.value?.total === 0"
    :class="box"
    class="[&_h2]:mb-1.5 [&_p]:max-w-105 [&_p]:mt-0 [&_p]:mx-auto [&_p]:mb-4.5 [&_p]:text-campus-muted [&_p]:text-[12px] [&_p]:leading-[1.65]"
  >
    <slot name="empty" />
  </div>
  <div v-else-if="pastTheEnd" :class="box">
    <h2 class="mb-1.5">There’s no page {{ filters.page }}</h2>
    <p :class="boxText">
      The list has {{ pages }} {{ pages === 1 ? "page" : "pages" }}.
    </p>
    <RouterLink
      :to="{
        query: { ...route.query, page: pages > 1 ? String(pages) : undefined },
      }"
      :class="outlineButton"
      :aria-current="undefined"
      >Go to page {{ pages }}</RouterLink
    >
  </div>
  <template v-else-if="list.data.value">
    <div
      class="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 mt-1 mx-0 mb-2.5 text-campus-muted text-[12px]"
    >
      <p
        id="results-summary"
        ref="summaryElement"
        class="m-0"
        tabindex="-1"
        role="status"
      >
        Showing <strong>{{ range.first }}–{{ range.last }}</strong> of
        <strong>{{ list.data.value.total.toLocaleString("en-GB") }}</strong>
        {{ plural(list.data.value.total)
        }}<template v-if="filters.search">
          matching “{{ filters.search }}”</template
        >
      </p>
      <span v-if="scope === 'all'"
        >Sorted by
        {{
          filters.sort === "priority"
            ? "Priority, highest first"
            : "newest first"
        }}</span
      >
    </div>
    <div
      class="overflow-hidden border border-campus-gray rounded-xl bg-campus-surface tablet:[&_table]:hidden"
    >
      <table
        class="w-full border-collapse text-[12px] [&_th]:py-2.75 [&_th]:px-3 [&_th]:border-b [&_th]:border-b-campus-gray [&_th]:bg-campus-surface [&_th]:text-campus-muted [&_th]:text-[10px] [&_th]:font-[650] [&_th]:tracking-[0.08em] [&_th]:text-left [&_th]:uppercase [&_th]:whitespace-nowrap [&_td]:p-3 [&_td]:border-b [&_td]:border-b-campus-panel [&_td]:align-middle [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-campus-hover"
      >
        <caption class="sr-only">
          {{
            label
          }}, page
          {{
            list.data.value.page
          }}
          of
          {{
            pages
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Service Request</th>
            <th v-if="scope !== 'assigned'" scope="col" class="laptop:hidden">
              Request Category
            </th>
            <th v-if="scope !== 'requested'" scope="col">Priority</th>
            <th scope="col">Status</th>
            <th v-if="scope !== 'requested'" scope="col" class="laptop:hidden">
              Requester
            </th>
            <th v-if="scope === 'all'" scope="col">Maintenance Officer</th>
            <th scope="col">Submitted</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list.data.value.items" :key="item.reference">
            <td>
              <span :class="reference">{{ item.reference }}</span>
            </td>
            <td class="min-w-55">
              <RouterLink
                :to="href(item)"
                class="text-campus-navy font-semibold no-underline wrap-anywhere hover:underline hover:underline-offset-[3px]"
                >{{ item.title }}</RouterLink
              ><span
                class="block mt-0.75 text-campus-muted text-[11px] wrap-anywhere"
                ><MapPin
                  class="inline-block flex-none w-3 h-3 align-[-2px]"
                  aria-hidden="true"
                />
                {{ item.location }}</span
              >
            </td>
            <td v-if="scope !== 'assigned'" class="laptop:hidden">
              <CategoryTag :category="item.category" />
            </td>
            <td v-if="scope !== 'requested'">
              <PriorityTag
                v-if="item.priority"
                :priority="item.priority"
              /><template v-else
                ><span class="text-campus-muted" aria-hidden="true">—</span
                ><span class="sr-only">Not shown</span></template
              >
            </td>
            <td>
              <div class="grid justify-items-start gap-1.25">
                <StatusChip :status="item.status" /><span
                  v-if="readOnly(item)"
                  :class="readOnlyTag"
                  ><Lock
                    class="inline-block w-3 h-3"
                    aria-hidden="true"
                  />Reassigned · read only</span
                >
              </div>
            </td>
            <td v-if="scope !== 'requested'" class="laptop:hidden">
              {{ item.requester.name }}
            </td>
            <td v-if="scope === 'all'">
              <slot name="officer" :item="item" />
            </td>
            <td>
              <time
                class="tabular-nums whitespace-nowrap"
                :datetime="item.submittedAt"
                >{{ formatShortDate(item.submittedAt) }}</time
              >
            </td>
          </tr>
        </tbody>
      </table>
      <ul class="hidden m-0 p-0 list-none tablet:block" :aria-label="label">
        <li
          v-for="item in list.data.value.items"
          :key="item.reference"
          class="relative p-3.5 border-b border-b-campus-panel last:border-b-0"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-2 mb-1.75"
          >
            <span :class="reference">{{ item.reference }}</span
            ><span class="flex flex-wrap gap-1.5"
              ><StatusChip :status="item.status" /><span
                v-if="readOnly(item)"
                :class="readOnlyTag"
                ><Lock
                  class="inline-block w-3 h-3"
                  aria-hidden="true"
                />Reassigned · read only</span
              ></span
            >
          </div>
          <RouterLink
            :to="href(item)"
            class="text-campus-navy font-semibold no-underline wrap-anywhere hover:underline hover:underline-offset-[3px] after:absolute after:inset-0"
            >{{ item.title }}</RouterLink
          ><span
            class="block mt-0.75 text-campus-muted text-[11px] wrap-anywhere"
            ><MapPin
              class="inline-block flex-none w-3 h-3 align-[-2px]"
              aria-hidden="true"
            />
            {{ item.location }}</span
          >
          <div
            class="flex flex-wrap items-center gap-y-1 gap-x-3 mt-1.75 text-campus-muted text-[11px]"
          >
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
            class="relative z-1 mt-2.5"
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
