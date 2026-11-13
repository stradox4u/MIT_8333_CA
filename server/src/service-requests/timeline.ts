import type {
  AssignmentEndReason,
  ServiceRequestStatus,
} from '../database/schema.js';
import type { Person, TimelineEntry } from './service-request.responses.js';

/** A Status Update as stored, with its actor's name. */
export interface StatusUpdateRow {
  /** From `timeline_sequence`: the order rows were written in. */
  id: number;
  occurredAt: Date;
  actor: Person | null;
  fromStatus: ServiceRequestStatus | null;
  toStatus: ServiceRequestStatus;
  reason: string | null;
  note: string | null;
  assignmentId: number | null;
}

/** An Assignment as stored, with names. */
export interface AssignmentRow {
  /** From `timeline_sequence`: the order rows were written in. */
  id: number;
  officer: Person;
  assignedBy: Person;
  assignedAt: Date;
  endedBy: Person | null;
  endedAt: Date | null;
  endReason: AssignmentEndReason | null;
}

interface Placed {
  occurredAt: Date;
  sequence: number;
  entry: TimelineEntry;
}

/**
 * Combines Status Updates and Assignments into one entry per action,
 * including both officers on reassignment. Entries sort oldest first, with
 * shared sequence numbers preserving their order when timestamps tie.
 */
export function buildTimeline(
  statusUpdates: StatusUpdateRow[],
  assignments: AssignmentRow[],
): TimelineEntry[] {
  const placed: Placed[] = [];

  // The Status Update an Assignment change caused: starting one always moves
  // the request to Assigned, and ending one without a replacement always
  // hands it back to Submitted.
  const causedBy = (assignment: AssignmentRow, to: ServiceRequestStatus) =>
    statusUpdates.find(
      (update) =>
        update.assignmentId === assignment.id && update.toStatus === to,
    );
  const statusUpdateOf = (update: StatusUpdateRow | undefined) =>
    update?.fromStatus
      ? { fromStatus: update.fromStatus, toStatus: update.toStatus }
      : null;

  for (const update of statusUpdates) {
    if (update.assignmentId === null) {
      placed.push({
        occurredAt: update.occurredAt,
        sequence: update.id,
        entry: {
          type: 'status_update',
          occurredAt: update.occurredAt,
          actor: update.actor,
          fromStatus: update.fromStatus,
          toStatus: update.toStatus,
          reason: update.reason,
          note: update.note,
        },
      });
    }
  }

  assignments.forEach((assignment, index) => {
    const previous = assignments[index - 1];
    const replaced = previous?.endReason === 'reassigned' ? previous : null;
    placed.push({
      occurredAt: assignment.assignedAt,
      sequence: assignment.id,
      entry: {
        type: 'assignment',
        occurredAt: assignment.assignedAt,
        actor: assignment.assignedBy,
        change: replaced ? 'reassigned' : 'assigned',
        officer: assignment.officer,
        previousOfficer: replaced?.officer ?? null,
        statusUpdate: statusUpdateOf(causedBy(assignment, 'assigned')),
      },
    });

    const { endedAt, endReason } = assignment;
    // A reassignment's end is part of the next Assignment's entry.
    if (endedAt && endReason && endReason !== 'reassigned') {
      const handedBack = causedBy(assignment, 'submitted');
      placed.push({
        occurredAt: endedAt,
        sequence: handedBack?.id ?? assignment.id,
        entry: {
          type: 'assignment',
          occurredAt: endedAt,
          actor: assignment.endedBy,
          change: endReason,
          officer: assignment.officer,
          previousOfficer: null,
          statusUpdate: statusUpdateOf(handedBack),
        },
      });
    }
  });

  return placed
    .sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.sequence - b.sequence,
    )
    .map(({ entry }) => entry);
}
