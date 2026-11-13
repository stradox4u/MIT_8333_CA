import { invalidInput } from '../validation.js';

/**
 * The outcomes that refuse an action on a Service Request. Repositories name
 * them through these types, and `refuseIf()` switches on them, so renaming
 * one breaks the build wherever it's stale.
 */
export type UnknownCategory = 'unknown_category';
type Refusal = UnknownCategory;

/**
 * Answers a refused action on a Service Request with its HTTP error; any
 * other outcome passes through, narrowed to the ones that went ahead.
 */
export function refuseIf<Outcome>(
  outcome: Outcome,
): asserts outcome is Exclude<Outcome, Refusal> {
  // Typed as `Refusal`, so a renamed refusal makes a stale case a compile
  // error, and a new refusal without a case fails the `never` check below.
  const refusal = outcome as unknown as Refusal;
  switch (refusal) {
    case 'unknown_category':
      // Shaped like a validation failure, so the form shows it on the field.
      throw invalidInput([
        { path: ['categoryId'], message: 'No such Request Category' },
      ]);
    default:
      // Any other outcome went ahead; this only checks every refusal is handled.
      refusal satisfies never;
  }
}
