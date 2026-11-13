import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ServiceRequestStatus } from '../database/schema.js';
import { invalidInput } from '../validation.js';

// The outcomes that refuse an action on a Service Request. Repositories name
// them through these types, and `refuseIf()` switches on them, so renaming
// one breaks the build wherever it's stale.

/** No such Service Request, or one the User may not see: the same answer. */
export type NotFound = 'not_found';
/** A `categoryId` that names no Request Category. */
export type UnknownCategory = 'unknown_category';
/** An `officerId` that names nobody who is an active Maintenance Officer. */
export type NotAnActiveOfficer = 'not_an_active_officer';
/** The User stopped being the request's current officer before acting. */
export type NotCurrentOfficer = 'not_current_officer';
/** The User no longer has permission when the request is locked. */
export type NotAllowed = 'not_allowed';
/** The action doesn't fit the request's current Status, which it names. */
export interface WrongStatus {
  wrongStatus: ServiceRequestStatus;
}
type Refusal =
  | NotFound
  | UnknownCategory
  | NotAnActiveOfficer
  | NotCurrentOfficer
  | NotAllowed
  | WrongStatus;

/** Refusals whose message says what was refused. */
type Worded = WrongStatus;

export const wrongStatus = (status: ServiceRequestStatus): WrongStatus => ({
  wrongStatus: status,
});

/** Each Status as people read it. */
export const STATUS_NAMES: Record<ServiceRequestStatus, string> = {
  submitted: 'Submitted',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
};

/**
 * Answers a refused action on a Service Request with its HTTP error; any
 * other outcome passes through, narrowed to the ones that went ahead.
 * `refused` words a wrong Status's message ("started", "unassigned"), and is
 * required exactly when the outcome can be one.
 */
export function refuseIf<Outcome>(
  outcome: Outcome,
  ...[refused]: [Extract<Outcome, Worded>] extends [never]
    ? []
    : [refused: string]
): asserts outcome is Exclude<Outcome, Refusal> {
  if (typeof outcome === 'object' && outcome && 'wrongStatus' in outcome) {
    const { wrongStatus } = outcome as WrongStatus;
    throw new ConflictException(
      `A Service Request that’s ${STATUS_NAMES[wrongStatus]} can’t be ${refused}`,
    );
  }
  // Typed as the string refusals, so a renamed refusal makes a stale case a
  // compile error, and a new one without a case fails the `never` check.
  const refusal = outcome as unknown as Exclude<Refusal, WrongStatus>;
  switch (refusal) {
    case 'not_found':
      throw new NotFoundException('No such Service Request');
    case 'unknown_category':
      // Shaped like a validation failure, so the form shows it on the field.
      throw invalidInput([
        { path: ['categoryId'], message: 'No such Request Category' },
      ]);
    case 'not_an_active_officer':
      throw invalidInput([
        { path: ['officerId'], message: 'Not an active Maintenance Officer' },
      ]);
    case 'not_current_officer':
      throw new ForbiddenException(
        'Only the request’s current officer can do this',
      );
    case 'not_allowed':
      throw new ForbiddenException('You may not change this Service Request');
    default:
      // Any other outcome went ahead; this only checks every refusal is handled.
      refusal satisfies never;
  }
}

/**
 * Answers a Service Request the User may not see exactly as one nobody has
 * (404), so nobody learns that it exists.
 */
export function refuseUnlessVisible(visible: boolean): void {
  if (!visible) {
    refuseIf<NotFound>('not_found');
  }
}
