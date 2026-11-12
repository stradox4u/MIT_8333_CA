import { z } from 'zod';
import { ROLE_IDS } from '../database/schema.js';

/** Zod pieces for User data, shared by every route that takes them. */

export const personName = z.string().trim().min(1).max(100);

export const emailAddress = z.email().max(320);

export const roleId = z.enum(ROLE_IDS);

/** The Roles a person may pick for themselves; the others are granted. */
export const selfChosenRole = z.enum(['student', 'staff']);

export const userId = z.uuid();
