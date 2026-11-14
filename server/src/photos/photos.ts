import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InjectDisk,
  StorageDisk,
  StorageFileNotFoundError,
} from '@nestjs/storage';
import { randomUUID } from 'node:crypto';
import { Clock } from '../clock.js';
import { AppConfig } from '../config/app-config.js';
import { invalidInput } from '../validation.js';
import { PhotosRepository } from './photos.repository.js';
import { PHOTO_LIFETIME_MS, type PhotoStage } from './photo.types.js';

@Injectable()
export class Photos {
  private readonly logger = new Logger(Photos.name);
  constructor(
    private readonly repository: PhotosRepository,
    @InjectDisk('photos') private readonly disk: StorageDisk,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  async upload(
    uploadedById: string,
    input: { contentType: string; contentLength: number },
  ) {
    const id = randomUUID();
    const prefix = this.config.photoStorage.keyPrefix;
    const uploadKey = `${prefix}uploads/${id}`;
    const storageKey = `${prefix}photos/${id}`;
    const signed = await this.disk.signedUpload(uploadKey, {
      ...input,
      expiresIn: '10m',
    });
    const now = new Date(this.clock.now());
    await this.repository.create({
      id,
      uploadedById,
      uploadKey,
      storageKey,
      contentType: input.contentType,
      size: input.contentLength,
      uploadedAt: now,
      serviceRequestId: null,
      stage: null,
      attachedAt: null,
      finalizedAt: null,
      unattachedSince: now,
      uploadDeletedAt: null,
    });
    return { objectKey: uploadKey, ...signed };
  }

  /** The request is already locked; photo locks serialize claims and cleanup. */
  async attach(
    store: PhotosRepository,
    keys: string[],
    actorId: string,
    requestId: string,
    stage: PhotoStage,
  ): Promise<boolean> {
    const previous =
      stage === 'report' ? await store.forRequest(requestId, stage) : [];
    const locked = await store.lockForAttachment(
      keys,
      previous.map((photo) => photo.id),
    );
    const selected = keys.map((key) =>
      locked.find((photo) => photo.uploadKey === key),
    );
    const now = new Date(this.clock.now());
    const prefix = this.config.photoStorage.keyPrefix;
    const bad = () =>
      invalidInput([
        {
          path: ['photoKeys'],
          message: 'Choose your own uploaded, unexpired photos',
        },
      ]);
    if (
      selected.some(
        (photo) =>
          !photo ||
          photo.uploadedById !== actorId ||
          !photo.storageKey.startsWith(prefix) ||
          (photo.serviceRequestId !== null &&
            (stage !== 'report' ||
              photo.serviceRequestId !== requestId ||
              photo.stage !== stage)) ||
          (photo.serviceRequestId === null &&
            (!photo.unattachedSince ||
              photo.unattachedSince.getTime() <=
                now.getTime() - PHOTO_LIFETIME_MS)),
      )
    )
      throw bad();
    const signal = AbortSignal.timeout(15_000);
    for (const photo of selected) {
      if (!photo || photo.finalizedAt) continue;
      try {
        // S3 copies the object internally; no file bytes pass through the API.
        await this.disk.copy(photo.uploadKey, photo.storageKey, { signal });
        const file = await this.disk.stat(photo.storageKey, { signal });
        if (file.size !== photo.size || file.contentType !== photo.contentType)
          throw bad();
      } catch (error) {
        if (error instanceof StorageFileNotFoundError) throw bad();
        if (error instanceof HttpException) throw error;
        this.logger.error('Photo attachment storage operation failed');
        throw new ServiceUnavailableException(
          'Photo storage is unavailable; please retry',
        );
      }
    }
    const added = selected
      .filter((photo) => photo && !photo.serviceRequestId)
      .map((photo) => photo!.id);
    const removed = previous
      .filter((photo) => !keys.includes(photo.uploadKey))
      .map((photo) => photo.id);
    await store.attach(added, requestId, stage, now);
    await store.detach(removed, now);
    return added.length > 0 || removed.length > 0;
  }

  /** Call only after the request's visibility check. */
  async forReference(reference: string) {
    const rows = await this.repository.forReference(reference);
    return Promise.all(
      rows.map(async (photo) => ({
        id: photo.id,
        objectKey: photo.uploadKey,
        stage: photo.stage!,
        contentType: photo.contentType,
        size: photo.size,
        attachedAt: photo.attachedAt!.toISOString(),
        url: await this.disk.signedUrl(photo.storageKey, {
          expiresIn: '15m',
          disposition: 'inline',
        }),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })),
    );
  }

  async cleanup(): Promise<void> {
    const now = new Date(this.clock.now());
    const cutoff = new Date(now.getTime() - PHOTO_LIFETIME_MS);
    const prefix = this.config.photoStorage.keyPrefix;
    for (const { id } of await this.repository.candidates(prefix, cutoff)) {
      try {
        await this.repository.transaction(async (store) => {
          const [photo] = await store.lock([id]);
          if (!photo || !photo.storageKey.startsWith(prefix)) return;
          const signal = AbortSignal.timeout(10_000);
          if (
            !photo.serviceRequestId &&
            photo.unattachedSince &&
            photo.unattachedSince <= cutoff
          ) {
            await this.disk.delete([photo.uploadKey, photo.storageKey], {
              signal,
            });
            await store.delete(id);
          } else if (!photo.uploadDeletedAt && photo.uploadedAt <= cutoff) {
            await this.disk.delete(photo.uploadKey, { signal });
            await store.markUploadDeleted(id, now);
          }
        });
      } catch {
        this.logger.error('Photo cleanup failed; retained metadata for retry');
      }
    }
  }
}
