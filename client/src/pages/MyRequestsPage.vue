<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import MapPin from "~icons/lucide/map-pin";
import Search from "~icons/lucide/search";
import Inbox from "~icons/lucide/inbox";
import Plus from "~icons/lucide/plus";
import LoadFailure from "../components/LoadFailure.vue";
import WorkspaceLayout from "../layouts/WorkspaceLayout.vue";
import StatusChip from "../components/StatusChip.vue";
import CategoryTag from "../components/CategoryTag.vue";
import ListPagination from "../components/ListPagination.vue";
import { isLoadFailure, useExpiredSession } from "../lib/expired-session";
import {
  PAGE_SIZE,
  STATUSES,
  serviceRequestsOptions,
  type ListFilters,
  type StatusFilter,
} from "../service-requests/api";
import { formatShortDate, statusNames } from "../service-requests/display";

const route = useRoute();
const router = useRouter();

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
  computed(() => serviceRequestsOptions("requested", filters.value)),
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
  <WorkspaceLayout width="wide">
    <div class="flex flex-wrap items-end justify-between gap-4.5 mb-5.5">
      <div class="min-w-0">
        <p
          class="mt-0 mx-0 text-[10px] font-semibold tracking-[0.16em] uppercase mb-3"
        >
          Service Requests you’ve reported
        </p>
        <h1 class="mb-2.5">My requests</h1>
        <p
          class="intro text-[13px] leading-[1.7] text-campus-muted wrap-anywhere m-0"
        >
          Follow each fault you’ve reported until it’s fixed.
        </p>
      </div>
    </div>
    <form
      class="flex flex-wrap items-end gap-3 mb-3.5"
      aria-label="Filter My requests"
      @submit.prevent
    >
      <div
        class="min-w-0 grid select-field gap-1.25 flex-[0_1_260px] phone:flex-[1_1_100%]"
      >
        <label class="block m-0 text-[12px] font-semibold" for="status"
          >Status</label
        >
        <select
          id="status"
          class="select bg-campus-surface w-full min-w-0 h-11.5 py-2.5 px-3 border border-campus-control rounded-[7px] text-campus-navy text-[14px] pr-8.5 appearance-none bg-no-repeat bg-position-[right_11px_center] aria-invalid:border-error aria-invalid:shadow-[0_0_0_1px_var(--color-error)_inset] phone:text-[16px]"
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
      class="py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center [&_.state-icon]:mt-0 [&_.state-icon]:mx-auto [&_.state-icon]:mb-4 [&_h2]:mb-1.5 [&_p]:max-w-105 [&_p]:mt-0 [&_p]:mx-auto [&_p]:mb-4.5 [&_p]:text-campus-muted [&_p]:text-[12px] [&_p]:leading-[1.65] [&_.button]:w-auto phone:[&_.button]:w-full"
      title="We couldn’t load your Service Requests"
      :pending="list.isFetching.value"
      @retry="list.refetch()"
    />
    <div
      v-else-if="loading"
      class="overflow-hidden border border-campus-gray rounded-xl bg-campus-surface tablet:[&_table]:hidden"
      aria-busy="true"
    >
      <p
        class="absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0_0_0_0)] whitespace-nowrap border-0"
        role="status"
      >
        Loading Service Requests…
      </p>
      <div
        v-for="row in 5"
        :key="row"
        class="grid grid-cols-[90px_1fr_110px_90px] gap-4 py-4 px-3.5 border-b border-b-campus-panel"
      >
        <span
          class="block h-3 rounded-md [background:linear-gradient(90deg,var(--color-campus-panel),#e7eded,var(--color-campus-panel))] bg-size-[200%_100%] animate-shimmer motion-reduce:animate-none"
        ></span
        ><span
          class="block h-3 rounded-md [background:linear-gradient(90deg,var(--color-campus-panel),#e7eded,var(--color-campus-panel))] bg-size-[200%_100%] animate-shimmer motion-reduce:animate-none"
        ></span
        ><span
          class="block h-3 rounded-md [background:linear-gradient(90deg,var(--color-campus-panel),#e7eded,var(--color-campus-panel))] bg-size-[200%_100%] animate-shimmer motion-reduce:animate-none"
        ></span
        ><span
          class="block h-3 rounded-md [background:linear-gradient(90deg,var(--color-campus-panel),#e7eded,var(--color-campus-panel))] bg-size-[200%_100%] animate-shimmer motion-reduce:animate-none"
        ></span>
      </div>
    </div>
    <div
      v-else-if="list.data.value?.total === 0 && filters.status"
      class="py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center"
      role="status"
    >
      <span
        class="state-icon w-11.5 h-11.5 grid place-items-center bg-campus-green border border-campus-navy rounded-[13px] [&.quiet]:bg-campus-panel quiet mt-0 mx-auto mb-4"
        ><Search
          class="icon inline-block flex-none align-[-3px] w-5.5 h-5.5"
          aria-hidden="true"
      /></span>
      <h2 class="mb-1.5">No Service Requests match</h2>
      <p
        class="max-w-105 mt-0 mx-auto mb-4.5 text-campus-muted text-[12px] leading-[1.65]"
      >
        Try a different Status, or clear the filter.
      </p>
      <button
        type="button"
        class="button inline-flex relative items-center justify-center gap-2.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 [&_.icon]:w-3.75 [&_.icon]:h-3.75 bg-transparent enabled:hover:bg-campus-panel compact-button max-w-full min-h-10.5 w-auto phone:w-full"
        @click="router.push({ query: {} })"
      >
        Clear the filter
      </button>
    </div>
    <div
      v-else-if="list.data.value?.total === 0"
      class="py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center"
    >
      <span
        class="state-icon w-11.5 h-11.5 grid place-items-center bg-campus-green border border-campus-navy rounded-[13px] [&.quiet]:bg-campus-panel mt-0 mx-auto mb-4"
        ><Inbox
          class="icon inline-block flex-none align-[-3px] w-5.5 h-5.5"
          aria-hidden="true"
      /></span>
      <h2 class="mb-1.5">You haven’t reported any faults yet</h2>
      <p
        class="max-w-105 mt-0 mx-auto mb-4.5 text-campus-muted text-[12px] leading-[1.65]"
      >
        When something on campus needs fixing, report it here and follow it
        until it’s fixed.
      </p>
      <RouterLink
        to="/requests/new"
        class="button inline-flex relative items-center justify-center gap-2.5 min-h-11.75 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 bg-campus-green enabled:hover:brightness-97 w-auto phone:w-full"
        ><Plus
          class="icon inline-block flex-none align-[-3px] w-3.75 h-3.75"
          aria-hidden="true"
        />Report a fault</RouterLink
      >
    </div>
    <div
      v-else-if="pastTheEnd"
      class="py-9.5 px-5.5 border border-campus-gray rounded-xl bg-campus-surface text-center [&_.state-icon]:mt-0 [&_.state-icon]:mx-auto [&_.state-icon]:mb-4"
    >
      <h2 class="mb-1.5">There’s no page {{ filters.page }}</h2>
      <p
        class="max-w-105 mt-0 mx-auto mb-4.5 text-campus-muted text-[12px] leading-[1.65]"
      >
        The list has {{ pages }} {{ pages === 1 ? "page" : "pages" }}.
      </p>
      <RouterLink
        :to="{
          query: {
            ...route.query,
            page: pages > 1 ? String(pages) : undefined,
          },
        }"
        class="button inline-flex relative items-center justify-center gap-2.5 py-2.75 px-8.25 border border-campus-navy rounded-[7px] text-campus-navy text-[12px] font-semibold leading-normal text-center no-underline disabled:opacity-65 [&_.icon]:w-3.75 [&_.icon]:h-3.75 bg-transparent enabled:hover:bg-campus-panel compact-button max-w-full min-h-10.5 w-auto phone:w-full"
        :aria-current="undefined"
        >Go to page {{ pages }}</RouterLink
      >
    </div>
    <template v-else-if="list.data.value">
      <div
        class="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 mt-1 mx-0 mb-2.5 text-campus-muted text-[12px]"
      >
        <p
          class="m-0"
          id="results-summary"
          ref="summaryElement"
          tabindex="-1"
          role="status"
        >
          Showing <strong>{{ range.first }}–{{ range.last }}</strong> of
          <strong>{{ list.data.value.total.toLocaleString("en-GB") }}</strong>
          {{ plural(list.data.value.total) }}
        </p>
      </div>
      <div
        class="overflow-hidden border border-campus-gray rounded-xl bg-campus-surface tablet:[&_table]:hidden"
      >
        <table
          class="w-full border-collapse text-[12px] [&_th]:py-2.75 [&_th]:px-3 [&_th]:border-b [&_th]:border-b-campus-gray [&_th]:bg-campus-surface [&_th]:text-campus-muted [&_th]:text-[10px] [&_th]:font-[650] [&_th]:tracking-[0.08em] [&_th]:text-left [&_th]:uppercase [&_th]:whitespace-nowrap [&_td]:p-3 [&_td]:border-b [&_td]:border-b-campus-panel [&_td]:align-middle [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-campus-hover"
        >
          <caption
            class="absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0_0_0_0)] whitespace-nowrap border-0"
          >
            My requests, page
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
              <th scope="col" class="hide-md laptop:hidden">
                Request Category
              </th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list.data.value.items" :key="item.reference">
              <td>
                <span
                  class="font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] font-semibold leading-[1.3] text-[12px] tracking-[0.02em] whitespace-nowrap"
                  >{{ item.reference }}</span
                >
              </td>
              <td class="title-cell min-w-55">
                <RouterLink
                  :to="`/requests/${encodeURIComponent(item.reference)}`"
                  class="text-campus-navy font-semibold no-underline wrap-anywhere hover:underline hover:underline-offset-[3px]"
                  >{{ item.title }}</RouterLink
                ><span
                  class="block mt-0.75 text-campus-muted text-[11px] wrap-anywhere"
                  ><MapPin
                    class="icon inline-block flex-none w-3 h-3 align-[-2px]"
                    aria-hidden="true"
                  />
                  {{ item.location }}</span
                >
              </td>
              <td class="hide-md laptop:hidden">
                <CategoryTag :category="item.category" />
              </td>
              <td><StatusChip :status="item.status" /></td>
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
        <ul
          class="hidden m-0 p-0 list-none tablet:block"
          aria-label="My requests"
        >
          <li
            v-for="item in list.data.value.items"
            :key="item.reference"
            class="relative p-3.5 border-b border-b-campus-panel last:border-b-0"
          >
            <div
              class="card-top flex flex-wrap items-center justify-between gap-2 mb-1.75"
            >
              <span
                class="font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] font-semibold leading-[1.3] text-[12px] tracking-[0.02em] whitespace-nowrap"
                >{{ item.reference }}</span
              ><StatusChip :status="item.status" />
            </div>
            <RouterLink
              :to="`/requests/${encodeURIComponent(item.reference)}`"
              class="text-campus-navy font-semibold no-underline wrap-anywhere hover:underline hover:underline-offset-[3px] [&::after]:content-[''] [&::after]:absolute [&::after]:inset-0"
              >{{ item.title }}</RouterLink
            ><span
              class="block mt-0.75 text-campus-muted text-[11px] wrap-anywhere"
              ><MapPin
                class="icon inline-block flex-none w-3 h-3 align-[-2px]"
                aria-hidden="true"
              />
              {{ item.location }}</span
            >
            <div
              class="card-meta flex flex-wrap items-center gap-y-1 gap-x-3 mt-1.75 text-campus-muted text-[11px]"
            >
              <CategoryTag :category="item.category" /><span
                >Submitted
                <time :datetime="item.submittedAt">{{
                  formatShortDate(item.submittedAt)
                }}</time></span
              >
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
  </WorkspaceLayout>
</template>
