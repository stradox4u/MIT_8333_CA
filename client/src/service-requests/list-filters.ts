import { computed, watch } from "vue";
import { useRoute, useRouter, type LocationQuery } from "vue-router";
import { STATUSES, PAGE_SIZE, type ListFilters, type Scope } from "./api";

const categories = [
  "electrical",
  "plumbing",
  "furniture",
  "network",
  "classroom_equipment",
  "other",
];
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scalar = (value: unknown) => (typeof value === "string" ? value : "");
function day(value: unknown) {
  const text = scalar(value);
  if (!/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
    ? text
    : undefined;
}
function pageFrom(value: unknown) {
  const text = scalar(value);
  const page = /^[1-9][0-9]*$/.test(text) ? Number(text) : 1;
  return Number.isSafeInteger(page) &&
    Number.isSafeInteger((page - 1) * PAGE_SIZE)
    ? page
    : 1;
}

/** Only supported, valid filters cross the HTTP boundary; URLs keep the same canonical values. */
export function readListFilters(
  query: LocationQuery,
  scope: Scope,
): ListFilters {
  const result: ListFilters = { page: pageFrom(query.page) };
  const status = scalar(query.status);
  if (["open", ...STATUSES].includes(status))
    result.status = status as ListFilters["status"];
  const search = scalar(query.search).trim().slice(0, 200);
  if (search) result.search = search;
  if (scope === "all") {
    if (categories.includes(scalar(query.category)))
      result.category = scalar(query.category);
    const priority = scalar(query.priority);
    if (["urgent", "high", "normal", "low"].includes(priority))
      result.priority = priority as ListFilters["priority"];
    if (uuid.test(scalar(query.officerId)))
      result.officerId = scalar(query.officerId).toLowerCase();
    result.submittedFrom = day(query.submittedFrom);
    result.submittedTo = day(query.submittedTo);
    if (
      result.submittedFrom &&
      result.submittedTo &&
      result.submittedFrom > result.submittedTo
    ) {
      delete result.submittedFrom;
      delete result.submittedTo;
    }
    if (query.sort === "priority") result.sort = "priority";
  }
  return result;
}
function toQuery(filters: ListFilters): LocationQuery {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(
        ([key, value]) =>
          value !== undefined && !(key === "page" && value === 1),
      )
      .map(([key, value]) => [key, String(value)]),
  );
}
const signature = (query: LocationQuery) =>
  JSON.stringify(Object.entries(query).sort(([a], [b]) => a.localeCompare(b)));

export function useListFilters(scope: () => Scope) {
  const route = useRoute();
  const router = useRouter();
  const path = route.path;
  const filters = computed(() => readListFilters(route.query, scope()));
  watch(
    () => route.fullPath,
    () => {
      if (route.path !== path) return;
      const canonical = toQuery(filters.value);
      if (signature(canonical) !== signature(route.query))
        void router.replace({ query: canonical });
    },
    { immediate: true },
  );
  function update(changes: Partial<ListFilters>) {
    void router.push({
      query: toQuery({ ...filters.value, ...changes, page: 1 }),
    });
  }
  return { filters, update };
}
