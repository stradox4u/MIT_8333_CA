import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  or,
} from 'drizzle-orm';
import { InjectDatabase, type Database } from '../database/database.js';
import { photos, serviceRequests } from '../database/schema.js';
import type { Photo, PhotoStage } from './photo.types.js';

@Injectable()
export class PhotosRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async create(photo: Photo): Promise<void> {
    await this.db.insert(photos).values(photo);
  }

  async lock(ids: string[]): Promise<Photo[]> {
    if (!ids.length) return [];
    return this.db
      .select()
      .from(photos)
      .where(inArray(photos.id, ids))
      .orderBy(asc(photos.id))
      .for('update');
  }

  async lockForAttachment(
    keys: string[],
    retainedIds: string[],
  ): Promise<Photo[]> {
    if (!keys.length && !retainedIds.length) return [];
    return this.db
      .select()
      .from(photos)
      .where(
        or(
          keys.length ? inArray(photos.uploadKey, keys) : undefined,
          retainedIds.length ? inArray(photos.id, retainedIds) : undefined,
        ),
      )
      .orderBy(asc(photos.id))
      .for('update');
  }

  forRequest(id: string, stage?: PhotoStage): Promise<Photo[]> {
    return this.db
      .select()
      .from(photos)
      .where(
        and(eq(photos.serviceRequestId, id), stage && eq(photos.stage, stage)),
      )
      .orderBy(asc(photos.attachedAt), asc(photos.id));
  }

  async forReference(reference: string): Promise<Photo[]> {
    const rows = await this.db
      .select({ photo: photos })
      .from(photos)
      .innerJoin(
        serviceRequests,
        eq(serviceRequests.id, photos.serviceRequestId),
      )
      .where(eq(serviceRequests.reference, reference))
      .orderBy(asc(photos.attachedAt), asc(photos.id));
    return rows.map(({ photo }) => photo);
  }

  async attach(
    ids: string[],
    requestId: string,
    stage: PhotoStage,
    at: Date,
  ): Promise<void> {
    if (!ids.length) return;
    await this.db
      .update(photos)
      .set({
        serviceRequestId: requestId,
        stage,
        attachedAt: at,
        finalizedAt: at,
        unattachedSince: null,
      })
      .where(inArray(photos.id, ids));
  }

  async detach(ids: string[], at: Date): Promise<void> {
    if (!ids.length) return;
    await this.db
      .update(photos)
      .set({
        serviceRequestId: null,
        stage: null,
        attachedAt: null,
        unattachedSince: at,
      })
      .where(inArray(photos.id, ids));
  }

  candidates(prefix: string, cutoff: Date): Promise<{ id: string }[]> {
    const escaped = prefix.replace(/[\\%_]/g, '\\$&');
    return this.db
      .select({ id: photos.id })
      .from(photos)
      .where(
        and(
          like(photos.storageKey, `${escaped}%`),
          or(
            and(
              isNotNull(photos.unattachedSince),
              lte(photos.unattachedSince, cutoff),
            ),
            and(isNull(photos.uploadDeletedAt), lte(photos.uploadedAt, cutoff)),
          ),
        ),
      )
      .orderBy(asc(photos.id));
  }

  transaction<T>(work: (store: PhotosRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new PhotosRepository(tx)));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(photos).where(eq(photos.id, id));
  }

  async markUploadDeleted(id: string, at: Date): Promise<void> {
    await this.db
      .update(photos)
      .set({ uploadDeletedAt: at })
      .where(eq(photos.id, id));
  }
}
