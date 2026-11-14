export const PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_LIFETIME_MS = 24 * 60 * 60 * 1000;
export type PhotoStage = 'report' | 'completion';
export interface Photo {
  id: string;
  uploadedById: string;
  serviceRequestId: string | null;
  stage: PhotoStage | null;
  uploadKey: string;
  storageKey: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
  attachedAt: Date | null;
  finalizedAt: Date | null;
  unattachedSince: Date | null;
  uploadDeletedAt: Date | null;
}
