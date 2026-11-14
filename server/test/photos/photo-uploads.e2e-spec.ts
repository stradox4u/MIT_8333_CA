import { randomUUID } from 'node:crypto';
import { PHOTO_LIFETIME_MS } from '../../src/photos/photo.types.js';
import {
  PNG,
  downloadPhoto,
  storagePath,
  uploadPhoto,
} from '../support/photos.js';
import {
  assign,
  idOf,
  requestInStatus,
  aServiceRequest,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const serviceRequestBody = aServiceRequest();

describe('Private photo uploads', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app?.close());

  it('signs a constrained upload for a signed-in User', async () => {
    const user = await app.signUp('photographer@example.test');
    const upload = await user
      .post('/api/photo-uploads')
      .send({ contentType: 'image/png', contentLength: 16 })
      .expect(201);
    expect(upload.body).toMatchObject({
      objectKey: expect.any(String),
      method: 'PUT',
      url: expect.any(String),
      headers: { 'content-type': 'image/png' },
    });
    expect(app.photoDisk.verifySignedUrl(upload.body.url, 'PUT')?.key).toMatch(
      /^test-env\/uploads\//,
    );
    expect(Date.parse(upload.body.expiresAt) - Date.now()).toBeGreaterThan(
      9 * 60_000,
    );
  });

  it('requires a completed sign-up', async () => {
    await app
      .browser()
      .post('/api/photo-uploads')
      .send({ contentType: 'image/png', contentLength: 16 })
      .expect(401);
    const pending = await app.signInByLink('pending@example.test');
    await pending
      .post('/api/photo-uploads')
      .send({ contentType: 'image/png', contentLength: 16 })
      .expect(403);
  });

  it.each([
    { contentType: 'image/svg+xml', contentLength: 16 },
    { contentType: 'application/pdf', contentLength: 16 },
    { contentType: 'image/png', contentLength: 0 },
    { contentType: 'image/png', contentLength: 5 * 1024 * 1024 + 1 },
    { contentType: 'image/png', contentLength: 16.5 },
    { contentType: 'image/png', contentLength: '16' },
    {
      contentType: 'image/png',
      contentLength: 16,
      storageKey: 'prod/photos/stolen',
    },
  ])('rejects invalid upload metadata %j', async (body) => {
    const user = await app.signUp('requester@example.test');
    await user.post('/api/photo-uploads').send(body).expect(400);
    expect(app.photoDisk.keys()).toEqual([]);
  });

  it('constrains the signed PUT method, type, length and signature', async () => {
    const user = await app.signUp('requester@example.test');
    const signed = await user
      .post('/api/photo-uploads')
      .send({ contentType: 'image/png', contentLength: PNG.length })
      .expect(201);
    const path = storagePath(signed.body.url);
    await user
      .put(path)
      .set('Content-Type', 'image/jpeg')
      .send(PNG)
      .expect(403);
    await user
      .put(path)
      .set('Content-Type', 'image/png')
      .send(PNG.subarray(0, 16))
      .expect(403);
    await user.get(path).expect(403);
    await user
      .put(path.replace('test-env', 'prod'))
      .set(signed.body.headers)
      .send(PNG)
      .expect(403);
    expect(app.photoDisk.keys()).toEqual([]);
  });

  it('attaches and downloads a report photo without exposing storage metadata', async () => {
    const user = await app.signUp('requester@example.test');
    const upload = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [upload.objectKey],
    });
    const shown = await user
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.headers['cache-control']).toBe('no-store');
    expect(shown.body.photos).toEqual([
      {
        id: upload.photoId,
        objectKey: upload.objectKey,
        stage: 'report',
        contentType: 'image/png',
        size: PNG.length,
        attachedAt: new Date(app.clock.now()).toISOString(),
        url: expect.any(String),
        expiresAt: expect.any(String),
      },
    ]);
    expect(shown.body.photos[0]).not.toHaveProperty('storageKey');
    expect(await downloadPhoto(app, shown.body.photos[0].url)).toEqual(PNG);
    const claims = app.photoDisk.verifySignedUrl(
      shown.body.photos[0].url,
      'GET',
    );
    expect(claims?.key).toMatch(/^test-env\/photos\//);
    expect(claims!.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      14 * 60_000,
    );
    expect(claims!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      15 * 60_000,
    );
    const other = await app.signUp('other@example.test');
    await other.get(`/api/service-requests/${reference}`).expect(404);
  });

  it('keeps attached bytes immutable when the staging PUT is replayed', async () => {
    const user = await app.signUp('requester@example.test');
    const upload = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [upload.objectKey],
    });
    const overwritten = Buffer.from(PNG);
    overwritten[30] ^= 1;
    await user
      .put(storagePath(upload.url))
      .set(upload.headers)
      .send(overwritten)
      .expect(200);
    const shown = await user
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(await downloadPhoto(app, shown.body.photos[0].url)).toEqual(PNG);
  });

  it('attaches object keys without reading file bytes through the API', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    const read = vi.spyOn(app.photoDisk, 'get');
    try {
      await submitServiceRequest(user, {
        ...serviceRequestBody,
        photoKeys: [photo.objectKey],
      });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('expires signed URLs and refreshes downloads when details are fetched again', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [photo.objectKey],
    });
    const original = (
      await user.get(`/api/service-requests/${reference}`).expect(200)
    ).body.photos[0];
    const later = Date.now() + 16 * 60_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(later);
    try {
      await app.browser().get(storagePath(original.url)).expect(403);
      await user
        .put(storagePath(photo.url))
        .set(photo.headers)
        .send(PNG)
        .expect(403);
      const refreshed = (
        await user.get(`/api/service-requests/${reference}`).expect(200)
      ).body.photos[0];
      expect(refreshed.url).not.toBe(original.url);
      expect(await downloadPhoto(app, refreshed.url)).toEqual(PNG);
    } finally {
      now.mockRestore();
    }
  });

  it('accepts three photos and the exact 5 MiB size limit', async () => {
    const user = await app.signUp('requester@example.test');
    const large = Buffer.alloc(5 * 1024 * 1024);
    PNG.copy(large);
    const photos = [
      await uploadPhoto(user, large),
      await uploadPhoto(user),
      await uploadPhoto(user),
    ];
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: photos.map((photo) => photo.objectKey),
    });
    const shown = await user
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body.photos).toHaveLength(3);
    const largest = shown.body.photos.find(
      (photo: { size: number }) => photo.size === large.length,
    );
    expect((await downloadPhoto(app, largest.url)).equals(large)).toBe(true);
  });

  it('refuses another uploader’s photo and rolls the submission back', async () => {
    const owner = await app.signUp('owner@example.test');
    const other = await app.signUp('other@example.test');
    const upload = await uploadPhoto(owner);
    await other
      .post('/api/service-requests')
      .send({ ...serviceRequestBody, photoKeys: [upload.objectKey] })
      .expect(400);
    expect(
      (await other.get('/api/service-requests?scope=requested')).body.total,
    ).toBe(0);
    expect(
      await submitServiceRequest(owner, {
        ...serviceRequestBody,
        photoKeys: [upload.objectKey],
      }),
    ).toBe('SR-PLUMB-1');
  });

  it('refuses unknown, missing, expired and already attached uploads', async () => {
    const user = await app.signUp('requester@example.test');
    const pending = await user
      .post('/api/photo-uploads')
      .send({ contentType: 'image/png', contentLength: PNG.length })
      .expect(201);
    for (const objectKey of [randomUUID(), pending.body.objectKey])
      await user
        .post('/api/service-requests')
        .send({ ...serviceRequestBody, photoKeys: [objectKey] })
        .expect(400);
    const upload = await uploadPhoto(user);
    await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [upload.objectKey],
    });
    await user
      .post('/api/service-requests')
      .send({ ...serviceRequestBody, photoKeys: [upload.objectKey] })
      .expect(400);
    const expiring = await uploadPhoto(user);
    app.clock.advance(PHOTO_LIFETIME_MS);
    const fresh = await app.signInByLink('requester@example.test');
    await fresh
      .post('/api/service-requests')
      .send({ ...serviceRequestBody, photoKeys: [expiring.objectKey] })
      .expect(400);
  });

  it('rejects duplicate IDs, too many photos and malformed IDs', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    for (const ids of [
      [photo.objectKey, photo.objectKey],
      Array.from({ length: 4 }, () => randomUUID()),
      [''],
    ])
      await user
        .post('/api/service-requests')
        .send({ ...serviceRequestBody, photoKeys: ids })
        .expect(400);
  });

  it.each(['image/jpeg', 'image/webp'])(
    'accepts and downloads %s',
    async (contentType) => {
      const user = await app.signUp('requester@example.test');
      const bytes =
        contentType === 'image/jpeg'
          ? Buffer.from('ffd8ffe000104a4649460001010000010001', 'hex')
          : Buffer.from('5249464610000000574542505650382000000000', 'hex');
      const photo = await uploadPhoto(user, bytes, contentType);
      const reference = await submitServiceRequest(user, {
        ...serviceRequestBody,
        photoKeys: [photo.objectKey],
      });
      const shown = await user
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(await downloadPhoto(app, shown.body.photos[0].url)).toEqual(bytes);
    },
  );

  it('validates the actual size and metadata after copying', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    await app.photoDisk.put(`test-env/uploads/${photo.photoId}`, PNG, {
      contentType: 'image/jpeg',
    });
    await user
      .post('/api/service-requests')
      .send({ ...serviceRequestBody, photoKeys: [photo.objectKey] })
      .expect(400);
    await app.photoDisk.put(
      `test-env/uploads/${photo.photoId}`,
      Buffer.concat([PNG, PNG]),
      { contentType: 'image/png' },
    );
    await user
      .post('/api/service-requests')
      .send({ ...serviceRequestBody, photoKeys: [photo.objectKey] })
      .expect(400);
  });

  it('rolls back storage failures and permits retry without consuming the photo', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    const copy = vi
      .spyOn(app.photoDisk, 'copy')
      .mockRejectedValueOnce(new Error('Synthetic storage outage'));
    try {
      await user
        .post('/api/service-requests')
        .send({ ...serviceRequestBody, photoKeys: [photo.objectKey] })
        .expect(503);
      expect(
        await submitServiceRequest(user, {
          ...serviceRequestBody,
          photoKeys: [photo.objectKey],
        }),
      ).toBe('SR-PLUMB-1');
    } finally {
      copy.mockRestore();
    }
  });

  it('retries cleanup after a storage failure without losing the orphan metadata', async () => {
    const user = await app.signUp('requester@example.test');
    await uploadPhoto(user);
    app.clock.advance(PHOTO_LIFETIME_MS);
    const remove = vi
      .spyOn(app.photoDisk, 'delete')
      .mockRejectedValueOnce(new Error('Synthetic storage outage'));
    try {
      await app.runDailyCleanup();
      expect(app.photoDisk.keys()).toHaveLength(1);
      await app.runDailyCleanup();
      expect(app.photoDisk.keys()).toEqual([]);
    } finally {
      remove.mockRestore();
    }
  });

  it('gives removed report photos a fresh 24-hour cleanup window', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [photo.objectKey],
    });
    app.clock.advance(PHOTO_LIFETIME_MS);
    const fresh = await app.signInByLink('requester@example.test');
    await fresh
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [] })
      .expect(200);
    await app.runDailyCleanup();
    expect(app.photoDisk.keys()).toEqual([`test-env/photos/${photo.photoId}`]);
    app.clock.advance(PHOTO_LIFETIME_MS);
    await app.runDailyCleanup();
    expect(app.photoDisk.keys()).toEqual([]);
  });

  it('replaces report photos while Submitted, without adding a timeline entry or sending mail', async () => {
    const user = await app.signUp('requester@example.test');
    const old = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [old.objectKey],
    });
    await app.notificationsSent();
    app.mailbox.clear();
    const next = await uploadPhoto(user);
    const edited = await user
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [next.objectKey] })
      .expect(200);
    expect(edited.body.photos.map((photo: { id: string }) => photo.id)).toEqual(
      [next.photoId],
    );
    expect(edited.body.timeline).toHaveLength(1);
    await app.notificationsSent();
    expect(app.mailbox.mails).toHaveLength(0);
    await user
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [] })
      .expect(200);
    expect(
      (await user.get(`/api/service-requests/${reference}`)).body,
    ).not.toHaveProperty('photos');
  });

  it('reattaches a removed report photo after the staging object was cleaned', async () => {
    const user = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [photo.objectKey],
    });
    app.clock.advance(PHOTO_LIFETIME_MS);
    await app.runDailyCleanup();
    const fresh = await app.signInByLink('requester@example.test');
    await fresh
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [] })
      .expect(200);
    await fresh
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [photo.objectKey] })
      .expect(200);
  });

  it('limits report photo edits to the Requester while Submitted', async () => {
    const { requester, admin, officer, officerId, reference } =
      await requestInStatus(app, 'submitted');
    await admin
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [] })
      .expect(403);
    await assign(admin, reference, officerId);
    await requester
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [] })
      .expect(409);
    await officer
      .patch(`/api/service-requests/${reference}`)
      .send({ photoKeys: [] })
      .expect(403);
  });

  it('attaches completion photos from the current officer and retains them on subsequent completions', async () => {
    const { requester, admin, officer, reference } = await requestInStatus(
      app,
      'in_progress',
    );
    const report = await uploadPhoto(requester);
    await officer
      .post(`/api/service-requests/${reference}/complete`)
      .send({ photoKeys: [report.objectKey] })
      .expect(400);
    expect(
      (await officer.get(`/api/service-requests/${reference}`)).body.status,
    ).toBe('in_progress');
    const first = await uploadPhoto(officer);
    const completed = await officer
      .post(`/api/service-requests/${reference}/complete`)
      .send({ photoKeys: [first.objectKey], note: 'Replaced the washer.' })
      .expect(200);
    expect(completed.body.photos[0]).toMatchObject({
      id: first.photoId,
      stage: 'completion',
    });
    await requester
      .post(`/api/service-requests/${reference}/not-fixed`)
      .send({ reason: 'Still leaking.' })
      .expect(200);
    await officer.post(`/api/service-requests/${reference}/start`).expect(200);
    const second = await uploadPhoto(officer);
    const again = await officer
      .post(`/api/service-requests/${reference}/complete`)
      .send({ photoKeys: [second.objectKey] })
      .expect(200);
    expect(again.body.photos).toHaveLength(2);
    for (const browser of [requester, admin]) {
      const shown = await browser
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(await downloadPhoto(app, shown.body.photos[0].url)).toEqual(PNG);
    }
  });

  it('retains attached files during cleanup and erasure, deleting only old pending uploads', async () => {
    const user = await app.signUp('requester@example.test');
    const kept = await uploadPhoto(user);
    const orphan = await uploadPhoto(user);
    const reference = await submitServiceRequest(user, {
      ...serviceRequestBody,
      photoKeys: [kept.objectKey],
    });
    app.clock.advance(PHOTO_LIFETIME_MS - 1);
    await app.runDailyCleanup();
    expect(app.photoDisk.keys()).toContain(
      `test-env/uploads/${orphan.photoId}`,
    );
    app.clock.advance(1);
    await app.runDailyCleanup();
    expect(app.photoDisk.keys()).toEqual([`test-env/photos/${kept.photoId}`]);
    const admin = await app.signInAsAdministrator();
    const fresh = await app.signInByLink('requester@example.test');
    await admin.post(`/api/users/${await idOf(fresh)}/erase`).expect(200);
    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(await downloadPhoto(app, shown.body.photos[0].url)).toEqual(PNG);
  });
});
