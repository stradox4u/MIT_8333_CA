import { PHOTO_LIFETIME_MS } from '../../src/photos/photo.types.js';
import { PNG, downloadPhoto, uploadPhoto } from '../support/photos.js';
import { createPostgresTestDatabase } from '../support/postgres-test-database.js';
import {
  aServiceRequest,
  requestInStatus,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Atomic photo attachments (Postgres)', () => {
  let app: TestApp;
  let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = await createTestApp({ database });
  });
  beforeEach(() => app.reset());
  afterAll(() => app?.close());

  it('lets one request claim an upload when attachments race', async () => {
    const user = await app.signUp('requester@example.test');
    const references = await Promise.all(
      ['plumbing', 'electrical'].map((categoryId) =>
        submitServiceRequest(user, aServiceRequest({ categoryId })),
      ),
    );
    const photo = await uploadPhoto(user);
    const claimed = await Promise.all(
      references.map((reference) =>
        user
          .patch(`/api/service-requests/${reference}`)
          .send({ photoKeys: [photo.objectKey] }),
      ),
    );
    expect(claimed.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    const shown = claimed.find((response) => response.status === 200)!;
    expect(shown.body.photos).toHaveLength(1);
    expect(await downloadPhoto(app, shown.body.photos[0].url)).toEqual(PNG);
    const attached = await database.pool.query(
      'select service_request_id from photos',
    );
    expect(attached.rows[0].service_request_id).toBeTruthy();
  });

  it('rechecks Submitted after assignment wins the request lock', async () => {
    const { requester, admin, officerId, reference } = await requestInStatus(
      app,
      'submitted',
    );
    const photo = await uploadPhoto(requester);
    const barrier = await database.pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await barrier.query('begin');
      await barrier.query(
        'select id from service_requests where reference = $1 for update',
        [reference],
      );
      const assigned = admin
        .put(`/api/service-requests/${reference}/assignment`)
        .send({ officerId })
        .then((response) => response);
      pending.push(assigned);
      await database.waitForBlockedTransactions(1);
      const edited = requester
        .patch(`/api/service-requests/${reference}`)
        .send({ photoKeys: [photo.objectKey] })
        .then((response) => response);
      pending.push(edited);
      await database.waitForBlockedTransactions(2);
      await barrier.query('commit');
      expect((await assigned).status).toBe(200);
      expect((await edited).status).toBe(409);
    } finally {
      await barrier.query('rollback');
      barrier.release();
      await Promise.allSettled(pending);
    }
    const shown = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body).not.toHaveProperty('photos');
    await submitServiceRequest(requester, {
      ...aServiceRequest(),
      photoKeys: [photo.objectKey],
    });
  });

  it('rolls back completion, attachments and emails when the Activity Log fails', async () => {
    const { officer, reference } = await requestInStatus(app, 'in_progress');
    const photo = await uploadPhoto(officer);
    await app.notificationsSent();
    app.mailbox.clear();
    await database.pool.query(`
      create function fail_photo_activity() returns trigger language plpgsql as $$
      begin raise exception 'Synthetic activity failure'; end $$;
      create trigger fail_photo_activity before insert on activity_log
        for each row execute function fail_photo_activity();
    `);
    try {
      await officer
        .post(`/api/service-requests/${reference}/complete`)
        .send({ photoKeys: [photo.objectKey] })
        .expect(500);
    } finally {
      await database.pool.query(
        'drop trigger fail_photo_activity on activity_log; drop function fail_photo_activity()',
      );
    }
    const shown = await officer
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body.status).toBe('in_progress');
    expect(shown.body).not.toHaveProperty('photos');
    await app.notificationsSent();
    expect(app.mailbox.mails).toHaveLength(0);
    const stored = await database.pool.query(
      'select service_request_id, finalized_at from photos',
    );
    expect(stored.rows).toEqual([
      { service_request_id: null, finalized_at: null },
    ]);
    app.clock.advance(PHOTO_LIFETIME_MS);
    await app.runDailyCleanup();
    expect(app.photoDisk.keys()).toEqual([]);
    expect((await database.pool.query('select id from photos')).rows).toEqual(
      [],
    );
  });

  it('cleans overlapping candidates once and leaves other environment prefixes alone', async () => {
    const user = await app.signUp('requester@example.test');
    const foreign = await uploadPhoto(user);
    await database.pool.query(
      "update photos set upload_key = replace(upload_key, 'test-env/', 'prod/'), storage_key = replace(storage_key, 'test-env/', 'prod/') where id = $1",
      [foreign.photoId],
    );
    await app.photoDisk.move(
      foreign.objectKey,
      foreign.objectKey.replace('test-env/', 'prod/'),
    );
    await uploadPhoto(user);
    app.clock.advance(PHOTO_LIFETIME_MS);
    await Promise.all([app.runDailyCleanup(), app.runDailyCleanup()]);
    expect(app.photoDisk.keys()).toEqual([
      foreign.objectKey.replace('test-env/', 'prod/'),
    ]);
    expect((await database.pool.query('select id from photos')).rows).toEqual([
      { id: foreign.photoId },
    ]);
  });
});
