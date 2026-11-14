import { z } from 'zod';
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from './photo.types.js';

export const photoKeys = z
  .array(z.string().min(1).max(1024))
  .max(3)
  .refine(
    (keys) => new Set(keys).size === keys.length,
    'Photos must be unique',
  );

export const photoUploadBody = z
  .object({
    contentType: z.enum(PHOTO_CONTENT_TYPES),
    contentLength: z.int().min(1).max(MAX_PHOTO_BYTES),
  })
  .strict();

export const photoUploadResponse = z.object({
  objectKey: z.string(),
  url: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string().meta({ format: 'date-time' }),
});

export const photoResponse = z.object({
  id: z.uuid(),
  objectKey: z.string(),
  stage: z.enum(['report', 'completion']),
  url: z.url(),
  expiresAt: z.string().meta({ format: 'date-time' }),
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  size: z.int().positive(),
  attachedAt: z.string().meta({ format: 'date-time' }),
});
