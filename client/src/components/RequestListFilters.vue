<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import SlidersHorizontal from "~icons/lucide/sliders-horizontal";
import {
  maintenanceOfficersOptions,
  requestCategoriesOptions,
  STATUSES,
  type ListFilters,
  type StatusFilter,
  type Priority,
} from "../service-requests/api";
import { priorityNames, statusNames } from "../service-requests/display";
import { useExpiredSession, isLoadFailure } from "../lib/expired-session";
const props = defineProps<{ filters: ListFilters }>();
const emit = defineEmits<{ update: [changes: Partial<ListFilters>] }>();
const categories = useQuery(requestCategoriesOptions);
const officers = useQuery(maintenanceOfficersOptions);
useExpiredSession(categories.error);
useExpiredSession(officers.error);
const expanded = ref(false);
const from = ref("");
const to = ref("");
const dateError = ref("");
watch(
  () => props.filters,
  (filters) => {
    from.value = filters.submittedFrom ?? "";
    to.value = filters.submittedTo ?? "";
    dateError.value = "";
  },
  { immediate: true },
);
const count = computed(
  () =>
    [
      props.filters.status,
      props.filters.category,
      props.filters.priority,
      props.filters.officerId,
      props.filters.submittedFrom,
      props.filters.submittedTo,
    ].filter(Boolean).length,
);
function dates() {
  dateError.value =
    from.value && to.value && from.value > to.value
      ? "Choose a date on or after the “from” date."
      : "";
  if (!dateError.value)
    emit("update", {
      submittedFrom: from.value || undefined,
      submittedTo: to.value || undefined,
    });
}
const selectClass =
  "select w-full min-w-0 h-10 py-1.75 px-3 pr-8.5 border border-campus-control rounded-[7px] bg-campus-surface text-[13px] appearance-none bg-no-repeat bg-position-[right_11px_center] phone:text-[16px]";
const dateClass =
  "w-full min-w-0 h-10 py-1.75 px-3 border border-campus-control rounded-[7px] bg-campus-surface text-[13px] phone:text-[16px]";
const fieldClass = "grid min-w-0 gap-1.25 text-[12px] font-semibold";
const chips = computed(() =>
  [
    {
      key: "status",
      label: "Status",
      value:
        props.filters.status === "open"
          ? "Open"
          : props.filters.status && statusNames[props.filters.status],
    },
    {
      key: "category",
      label: "Request Category",
      value:
        categories.data.value?.find((c) => c.id === props.filters.category)
          ?.name ?? props.filters.category,
    },
    {
      key: "priority",
      label: "Priority",
      value: props.filters.priority && priorityNames[props.filters.priority],
    },
    {
      key: "officerId",
      label: "Maintenance Officer",
      value:
        officers.data.value?.find((o) => o.id === props.filters.officerId)
          ?.name ?? props.filters.officerId,
    },
    {
      key: "submittedFrom",
      label: "Submitted from (UTC)",
      value: props.filters.submittedFrom,
    },
    {
      key: "submittedTo",
      label: "Submitted to (UTC)",
      value: props.filters.submittedTo,
    },
  ].filter((chip) => chip.value),
);
</script>
<template>
  <div class="grid min-w-0 gap-1.25 flex-[0_1_190px] phone:flex-[1_1_100%]">
    <label for="sort" class="text-[12px] font-semibold">Sort</label>
    <select
      id="sort"
      :value="filters.sort ?? 'newest'"
      :class="selectClass"
      class="h-11.5 text-[14px]"
      @change="
        emit('update', {
          sort:
            ($event.target as HTMLSelectElement).value === 'priority'
              ? 'priority'
              : undefined,
        })
      "
    >
      <option value="newest">Newest first</option>
      <option value="priority">Priority, highest first</option>
    </select>
  </div>
  <button
    type="button"
    class="hidden phone:inline-flex items-center justify-center gap-2 min-h-10.5 px-4 border border-campus-navy rounded-[7px] text-[12px] font-semibold hover:bg-campus-panel"
    :aria-expanded="expanded"
    aria-controls="admin-filters"
    @click="expanded = !expanded"
  >
    <SlidersHorizontal class="w-4 h-4" aria-hidden="true" />Filters{{
      count ? ` (${count})` : ""
    }}
  </button>
  <fieldset
    id="admin-filters"
    :class="expanded ? '' : 'phone:hidden'"
    class="grid grid-cols-6 laptop:grid-cols-3 tablet:grid-cols-2 phone:grid-cols-1 gap-3 basis-full w-full min-w-0 p-3.5 border border-campus-gray rounded-[11px] bg-campus-surface"
  >
    <legend class="sr-only">Filters</legend>
    <div :class="fieldClass">
      <label for="status">Status</label
      ><select
        id="status"
        :class="selectClass"
        :value="filters.status ?? ''"
        @change="
          emit('update', {
            status:
              (($event.target as HTMLSelectElement).value as StatusFilter) ||
              undefined,
          })
        "
      >
        <option value="">Any Status</option>
        <option value="open">Open (Submitted, Assigned, In Progress)</option>
        <option v-for="status in STATUSES" :key="status" :value="status">
          {{ statusNames[status] }}
        </option>
      </select>
    </div>
    <div :class="fieldClass">
      <label for="category">Request Category</label
      ><select
        id="category"
        :class="selectClass"
        :value="filters.category ?? ''"
        @change="
          emit('update', {
            category: ($event.target as HTMLSelectElement).value || undefined,
          })
        "
      >
        <option value="">Any category</option>
        <option
          v-for="category in categories.data.value"
          :key="category.id"
          :value="category.id"
        >
          {{ category.name }}
        </option>
      </select>
    </div>
    <div :class="fieldClass">
      <label for="priority">Priority</label
      ><select
        id="priority"
        :class="selectClass"
        :value="filters.priority ?? ''"
        @change="
          emit('update', {
            priority:
              (($event.target as HTMLSelectElement).value as Priority) ||
              undefined,
          })
        "
      >
        <option value="">Any Priority</option>
        <option
          v-for="priority in ['urgent', 'high', 'normal', 'low'] as const"
          :key="priority"
          :value="priority"
        >
          {{ priorityNames[priority] }}
        </option>
      </select>
    </div>
    <div :class="fieldClass">
      <label for="officer">Maintenance Officer</label
      ><select
        id="officer"
        :class="selectClass"
        :value="filters.officerId ?? ''"
        @change="
          emit('update', {
            officerId: ($event.target as HTMLSelectElement).value || undefined,
          })
        "
      >
        <option value="">Anyone</option>
        <option
          v-if="
            filters.officerId &&
            !officers.data.value?.some((o) => o.id === filters.officerId)
          "
          :value="filters.officerId"
        >
          Selected officer
        </option>
        <option
          v-for="officer in officers.data.value"
          :key="officer.id"
          :value="officer.id"
        >
          {{ officer.name }}
        </option>
      </select>
    </div>
    <div :class="fieldClass">
      <label for="submitted-from">Submitted from</label
      ><input
        id="submitted-from"
        aria-describedby="submitted-date-hint"
        v-model="from"
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        :class="dateClass"
        class="pr-3"
        @change="dates"
      />
    </div>
    <div :class="fieldClass">
      <label for="submitted-to">Submitted to</label
      ><input
        id="submitted-to"
        v-model="to"
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        :class="dateClass"
        class="pr-3 aria-invalid:border-error"
        :aria-invalid="!!dateError"
        aria-describedby="submitted-date-hint submitted-date-error"
        @change="dates"
      />
      <p
        v-if="dateError"
        id="submitted-date-error"
        class="m-0 text-error text-[11px]"
        role="alert"
      >
        {{ dateError }}
      </p>
    </div>
    <p
      id="submitted-date-hint"
      class="col-span-full m-0 text-[11px] text-campus-muted font-normal"
    >
      Submitted dates include the whole day in UTC.
    </p>
    <p
      v-if="
        isLoadFailure(categories.error.value) ||
        isLoadFailure(officers.error.value)
      "
      class="col-span-full text-error text-[12px]"
      role="alert"
    >
      Some filter choices couldn’t load.
      <button
        type="button"
        class="underline"
        @click="
          categories.refetch();
          officers.refetch();
        "
      >
        Try again
      </button>
    </p>
  </fieldset>
  <div
    v-if="chips.length"
    class="basis-full flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]"
  >
    <span class="text-campus-muted">Filtered by</span
    ><span
      v-for="chip in chips"
      :key="chip.key"
      class="inline-flex max-w-full items-center gap-1 rounded-md border border-campus-control px-2 py-1 wrap-anywhere"
      >{{ chip.label }}: <strong class="min-w-0">{{ chip.value }}</strong
      ><button
        type="button"
        class="w-6.5 h-6.5 shrink-0"
        :aria-label="`Remove filter ${chip.label}: ${chip.value}`"
        @click="emit('update', { [chip.key]: undefined })"
      >
        ×
      </button></span
    ><button
      type="button"
      class="underline min-h-8"
      @click="
        emit('update', {
          status: undefined,
          category: undefined,
          priority: undefined,
          officerId: undefined,
          submittedFrom: undefined,
          submittedTo: undefined,
        })
      "
    >
      Clear all filters
    </button>
  </div>
</template>
