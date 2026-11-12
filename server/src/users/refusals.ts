import { ConflictException, NotFoundException } from '@nestjs/common';

/**
 * The outcomes that refuse an action on a User. Repositories name them
 * through these types, and `refuseIf()` switches on them, so renaming one
 * breaks the build wherever it's stale.
 */
export type NotFound = 'not_found';
export type UserErased = 'user_erased';
export type LastAdministrator = 'last_administrator';
type Refusal = NotFound | UserErased | LastAdministrator;

/** Refusals whose message says what was refused. */
type Worded = UserErased | LastAdministrator;

/**
 * Answers a refused action on a User with its HTTP error; any other outcome
 * passes through, narrowed to the ones that went ahead. `refused` words the
 * message ("deactivated", "given another Role"), and is required exactly
 * when the outcome can be a worded refusal.
 */
export function refuseIf<Outcome>(
  outcome: Outcome,
  ...[refused]: [Extract<Outcome, Worded>] extends [never]
    ? []
    : [refused: string]
): asserts outcome is Exclude<Outcome, Refusal> {
  // Typed as `Refusal`, so a renamed refusal makes a stale case a compile
  // error, and a new refusal without a case fails the `never` check below.
  const refusal = outcome as unknown as Refusal;
  switch (refusal) {
    case 'not_found':
      throw new NotFoundException();
    case 'user_erased':
      throw new ConflictException(`An Erased User can’t be ${refused}`);
    case 'last_administrator':
      throw new ConflictException(
        `The last active Administrator can’t be ${refused}`,
      );
    default:
      // Any other outcome went ahead; this only checks every refusal is handled.
      refusal satisfies never;
  }
}
