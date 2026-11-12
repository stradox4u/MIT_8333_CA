import { z } from 'zod';

const length = (value: string) => [...value].length;

/**
 * The one rule set for every password a User sets (ADR-0006): 12–128
 * characters, with at least one uppercase letter, one lowercase letter, one
 * digit and one special character (anything that isn't a letter or digit,
 * spaces included). Letters and digits from any script count.
 */
export const password = z
  .string()
  .refine((value) => length(value) >= 12, 'must be at least 12 characters')
  .refine((value) => length(value) <= 128, 'must be at most 128 characters')
  .refine((value) => /\p{Lu}/u.test(value), 'needs an uppercase letter')
  .refine((value) => /\p{Ll}/u.test(value), 'needs a lowercase letter')
  .refine((value) => /\p{Nd}/u.test(value), 'needs a digit')
  .refine((value) => /[^\p{L}\p{N}]/u.test(value), 'needs a special character');
