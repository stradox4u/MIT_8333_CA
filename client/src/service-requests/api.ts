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

/** A request's current Assignment. */
export interface Assignment {
  officer: Person;
  assignedAt: string;
}

export interface ServiceRequestSummary {
  reference: string;
  title: string;
  category: RequestCategory;
  location: string;
  status: Status;
  /**
   * Only for Administrators and the request's current officer: left out
   * entirely for anyone else.
   */
  priority?: Priority;
  requester: Person;
  submittedAt: string;
  assignment: Assignment | null;
}

export interface StatusUpdate {
  type: "status_update";
  occurredAt: string;
  /** Empty when nobody acted: the automatic verification after 7 days. */
  actor: Person | null;
  fromStatus: Status | null;
  toStatus: Status;
  reason: string | null;
  /** The officer's completion note, on the Completed Status Update. */
  note: string | null;
}

/** An Assignment change, with the Status change the same action made. */
export interface AssignmentChange {
  type: "assignment";
  occurredAt: string;
  actor: Person | null;
  /** `officer_left`: the officer was demoted, deactivated or erased. */
  change: "assigned" | "reassigned" | "unassigned" | "officer_left";
  /** Who was given it, or whose Assignment ended. */
  officer: Person;
  /** Whom it was taken from, when reassigned. */
  previousOfficer: Person | null;
  statusUpdate: { fromStatus: Status; toStatus: Status } | null;
}

export interface ProgressNote {
  type: "progress_note";
  occurredAt: string;
  actor: Person;
  text: string;
}

export type TimelineEntry = StatusUpdate | AssignmentChange | ProgressNote;

export interface ServiceRequestDetails extends ServiceRequestSummary {
  description: string;
  /** Oldest first. */
  timeline: TimelineEntry[];
}

/** An active Maintenance Officer, with their count of Open Assignments. */
export interface MaintenanceOfficer {
  id: string;
  name: string;
  openAssignments: number;
}

/**
 * Which list: the requests a User raised, a Maintenance Officer's
 * Assignments (past ones included), or every request (Administrators).
 */
export type Scope = "requested" | "assigned" | "all";

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

export function serviceRequestsOptions(scope: Scope, filters: ListFilters) {
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

/** Administrators only. Sorted by name; the picker orders them itself. */
export const maintenanceOfficersOptions = queryOptions({
  queryKey: ["maintenance-officers"] as const,
  queryFn: ({ signal }) =>
    api<MaintenanceOfficer[]>("/maintenance-officers", { signal }),
  // Open Assignment counts change with every assignment.
  staleTime: 0,
});

const action = (reference: string, path: string, init: RequestInit) =>
  api<ServiceRequestDetails>(
    `/service-requests/${encodeURIComponent(reference)}${path}`,
    init,
  );

/** Assigns a Submitted request, or reassigns one; it ends up Assigned. */
export const assignOfficer = (reference: string, officerId: string) =>
  action(reference, "/assignment", {
    method: "PUT",
    body: JSON.stringify({ officerId }),
  });
/** Takes an Assigned or In Progress request back to Submitted. */
export const unassignOfficer = (reference: string) =>
  action(reference, "/assignment", { method: "DELETE" });
/** The current officer moves Assigned to In Progress. */
export const startWork = (reference: string) =>
  action(reference, "/start", { method: "POST" });
/** The current officer moves In Progress to Completed, with an optional note. */
export const completeWork = (reference: string, note: string) =>
  action(reference, "/complete", {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });

export const addProgressNote = (reference: string, text: string) =>
  action(reference, "/progress-notes", {
    method: "POST",
    body: JSON.stringify({ text }),
  });

export const verifyRequest = (reference: string) =>
  action(reference, "/verify", { method: "POST" });

export const answerNotFixed = (reference: string, reason: string) =>
  action(reference, "/not-fixed", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const cancelRequest = (reference: string, reason: string) =>
  action(reference, "/cancel", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const editRequest = (
  reference: string,
  fields: Partial<NewServiceRequest>,
) => action(reference, "", { method: "PATCH", body: JSON.stringify(fields) });
export const setRequestPriority = (reference: string, priority: Priority) =>
  action(reference, "/priority", {
    method: "PUT",
    body: JSON.stringify({ priority }),
  });

export function submitServiceRequest(body: NewServiceRequest) {
  return api<{ reference: string }>("/service-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
