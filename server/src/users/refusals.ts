import { ConflictException, NotFoundException } from '@nestjs/common';

/** Repository outcomes that refuse an action on a User. */
type Refusal = 'not_found' | 'user_erased' | 'last_administrator';

/**
 * Answers a refused action on a User with its HTTP error, worded for what
 * was refused ("deactivated", "given another Role"); any other outcome
 * passes through, narrowed to the ones that went ahead.
 */
export function refuseIf<Outcome>(
  outcome: Outcome,
  refused: string,
): asserts outcome is Exclude<Outcome, Refusal> {
  switch (outcome as unknown) {
    case 'not_found':
      throw new NotFoundException();
    case 'user_erased':
      throw new ConflictException(`An Erased User can’t be ${refused}`);
    case 'last_administrator':
      throw new ConflictException(
        `The last active Administrator can’t be ${refused}`,
      );
  }
}
