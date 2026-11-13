import { keepPreviousData, queryOptions } from "@tanstack/vue-query";
import { api } from "../lib/api";

/** Service Request data from the API (server/docs/service-requests.md). */

export interface RequestCategory {
  id: string;
  name: string;
  code: string;
}

export const STATUSES = [
  "submitted",
  "assigned",
  "in_progress",
  "completed",
  "verified",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = "low" | "normal" | "high" | "urgent";

/** A User as a Service Request shows them. An Erased User's name is "Erased user". */
export interface Person {
  id: string;
  name: string;
}

export interface ServiceRequestSummary {
  reference: string;
  title: string;
  category: RequestCategory;
  location: string;
  status: Status;
  /** Left out entirely for anyone the server doesn't show the Priority to. */
  priority?: Priority;
  requester: Person;
  submittedAt: string;
}

export interface StatusUpdate {
  type: "status_update";
  occurredAt: string;
  /** Empty when nobody acted: the automatic verification after 7 days. */
  actor: Person | null;
  fromStatus: Status | null;
  toStatus: Status;
  reason: string | null;
}

export interface ServiceRequestDetails extends ServiceRequestSummary {
  description: string;
  /** Oldest first. */
  timeline: StatusUpdate[];
}

export interface Page<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

/** A Status, or `open`: Submitted, Assigned or In Progress. */
export type StatusFilter = Status | "open";
export interface ListFilters {
  status?: StatusFilter;
  page: number;
}
export const PAGE_SIZE = 20;

export interface NewServiceRequest {
  title: string;
  categoryId: string;
  location: string;
  description: string;
}

export const requestCategoriesOptions = queryOptions({
  queryKey: ["request-categories"] as const,
  queryFn: ({ signal }) =>
    api<RequestCategory[]>("/request-categories", { signal }),
  // Reference data: it changes only with a server release.
  staleTime: Infinity,
});

export function serviceRequestsOptions(
  scope: "requested",
  filters: ListFilters,
) {
  return queryOptions({
    queryKey: ["service-requests", scope, filters] as const,
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ scope });
      // Left out rather than sent empty.
      if (filters.status) query.set("status", filters.status);
      query.set("page", String(filters.page));
      query.set("pageSize", String(PAGE_SIZE));
      return api<Page<ServiceRequestSummary>>(`/service-requests?${query}`, {
        signal,
      });
    },
    // Paging and filtering keep the previous rows until the next page arrives.
    placeholderData: keepPreviousData,
  });
}

export function serviceRequestOptions(reference: string) {
  return queryOptions({
    queryKey: ["service-request", reference] as const,
    queryFn: ({ signal }) =>
      api<ServiceRequestDetails>(
        `/service-requests/${encodeURIComponent(reference)}`,
        { signal },
      ),
  });
}

export function submitServiceRequest(body: NewServiceRequest) {
  return api<{ reference: string }>("/service-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
