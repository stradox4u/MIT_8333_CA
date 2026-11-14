import { sql } from 'drizzle-orm';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';
import { uploadPhoto } from '../support/photos.js';
import {
  aServiceRequest,
  submitServiceRequest,
  requestInStatus,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Deleting Service Requests', () => {
  let app: TestApp;
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
    app = await createTestApp({ database });
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it.each([
    'submitted',
    'assigned',
    'in_progress',
    'completed',
    'verified',
    'cancelled',
  ] as const)(
    'soft deletes %s work, hiding every operational view and retaining its audit trail',
    async (status) => {
      const { admin, requester, officer, reference } = await requestInStatus(
        app,
        status,
      );
      await requester
        .delete(`/api/service-requests/${reference}`)
        .send({ reason: 'Duplicate report' })
        .expect(403);
      await officer
        .delete(`/api/service-requests/${reference}`)
        .send({ reason: 'Duplicate report' })
        .expect(403);
      await app.notificationsSent();
      app.mailbox.clear();
      const before = await database.db.execute(
        sql`select count(*)::integer as count from status_updates`,
      );
      await admin
        .delete(`/api/service-requests/${reference}`)
        .send({ reason: 'Duplicate report' })
        .expect(204);
      const retained = await database.db.execute(
        sql`select status, deleted_at from service_requests where reference = ${reference}`,
      );
      expect(retained.rows[0]).toMatchObject({ status });
      expect(retained.rows[0].deleted_at).not.toBeNull();
      const after = await database.db.execute(
        sql`select count(*)::integer as count from status_updates`,
      );
      expect(after.rows).toEqual(before.rows);
      const held = await database.db.execute(
        sql`select end_reason, ended_at from assignments where service_request_id = (select id from service_requests where reference = ${reference})`,
      );
      if (!['submitted', 'cancelled'].includes(status)) {
        expect(held.rows[0].end_reason).toBe('request_deleted');
        expect(held.rows[0].ended_at).not.toBeNull();
      }
      await app.notificationsSent();
      expect(app.mailbox.mails).toHaveLength(
        ['submitted', 'cancelled'].includes(status) ? 1 : 2,
      );
      for (const mail of app.mailbox.mails) {
        expect(mail.subject).toBe(`${reference}: Service Request deleted`);
        expect(mail.text).toContain('Duplicate report');
        expect(mail.text).not.toContain('/requests/');
      }
      for (const browser of [admin, requester, officer]) {
        await browser.get(`/api/service-requests/${reference}`).expect(404);
      }
      for (const [browser, scope] of [
        [admin, 'all'],
        [requester, 'requested'],
        [officer, 'assigned'],
      ] as const) {
        const list = await browser
          .get(`/api/service-requests?scope=${scope}`)
          .expect(200);
        expect(list.body).toMatchObject({ items: [], total: 0 });
        const counts = await browser
          .get(`/api/service-requests/summary?scope=${scope}`)
          .expect(200);
        expect(Object.values(counts.body.byStatus)).toEqual([0, 0, 0, 0, 0, 0]);
      }
      const exported = await admin
        .get('/api/service-requests/export.csv')
        .expect(200);
      expect(exported.text).not.toContain(reference);
      const officers = await admin.get('/api/maintenance-officers').expect(200);
      expect(officers.body[0].openAssignments).toBe(0);
      await admin
        .delete(`/api/service-requests/${reference}`)
        .send({ reason: 'Duplicate report' })
        .expect(404);
      await admin
        .patch(`/api/service-requests/${reference}`)
        .send({ location: 'Another room' })
        .expect(404);
      await officer
        .post(`/api/service-requests/${reference}/start`)
        .expect(404);
      const log = await admin.get('/api/activity-log').expect(200);
      expect(
        log.body.filter(
          (entry: { action: string }) => entry.action === 'request_deleted',
        ),
      ).toEqual([
        expect.objectContaining({
          serviceRequest: { reference },
          actor: expect.objectContaining({ name: 'Grace Hopper' }),
          details: {
            reference,
            previousStatus: status,
            reason: 'Duplicate report',
          },
        }),
      ]);
      expect(
        log.body.some(
          (entry: { action: string }) => entry.action === 'status_changed',
        ),
      ).toBe(true);
    },
  );

  it('requires a reason and preserves evidence after cleanup and officer departure', async () => {
    const { admin, officerId, reference } = await requestInStatus(
      app,
      'completed',
    );
    for (const reason of [undefined, '', 'ab', 'x'.repeat(1001)])
      await admin
        .delete(`/api/service-requests/${reference}`)
        .send({ reason })
        .expect(400);
    await admin
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send({ text: 'Retained evidence note' })
      .expect(201);
    await admin
      .delete(`/api/service-requests/${reference}`)
      .send({ reason: 'Duplicate report' })
      .expect(204);
    await admin.post(`/api/users/${officerId}/deactivate`).expect(200);
    app.clock.advance(8 * 24 * 60 * 60 * 1000);
    await app.runDailyCleanup();
    expect(await app.databaseMentions('Retained evidence note')).toBe(true);
    const retained = await database.db.execute(
      sql`select status from service_requests where reference = ${reference}`,
    );
    expect(retained.rows[0].status).toBe('completed');
    const signedIn = await app.signInAsAdministrator('another@example.com');
    await signedIn.get(`/api/service-requests/${reference}`).expect(404);
  });

  it('rolls back deletion and Assignment changes without email when the Activity Log fails', async () => {
    const { admin, reference } = await requestInStatus(app, 'assigned');
    await app.notificationsSent();
    app.mailbox.clear();
    await database.db.execute(
      sql`alter table activity_log add constraint reject_deletion check (action <> 'request_deleted')`,
    );
    try {
      await admin
        .delete(`/api/service-requests/${reference}`)
        .send({ reason: 'Duplicate report' })
        .expect(500);
      const visible = await admin
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(visible.body.status).toBe('assigned');
      expect(visible.body.assignment).not.toBeNull();
      await app.notificationsSent();
      expect(app.mailbox.mails).toHaveLength(0);
    } finally {
      await database.db.execute(
        sql`alter table activity_log drop constraint reject_deletion`,
      );
    }
  });

  it('suppresses the actor and unreachable recipients', async () => {
    const { admin, requesterId, reference } = await requestInStatus(
      app,
      'submitted',
    );
    await admin.post(`/api/users/${requesterId}/deactivate`).expect(200);
    await app.notificationsSent();
    app.mailbox.clear();
    await admin
      .delete(`/api/service-requests/${reference}`)
      .send({ reason: 'Duplicate report' })
      .expect(204);
    await app.notificationsSent();
    expect(app.mailbox.mails).toHaveLength(0);
    const own = await admin
      .post('/api/service-requests')
      .send({
        title: 'Duplicate fault',
        categoryId: 'plumbing',
        location: 'Block C',
        description: 'This duplicates another existing report.',
      })
      .expect(201);
    await app.notificationsSent();
    app.mailbox.clear();
    await admin
      .delete(`/api/service-requests/${own.body.reference}`)
      .send({ reason: 'Duplicate report' })
      .expect(204);
    await app.notificationsSent();
    expect(app.mailbox.mails).toHaveLength(0);
  });

  it('retains attached photo evidence while ordinary cleanup removes only the staging upload', async () => {
    const admin = await app.signInAsAdministrator();
    const requester = await app.signUp('requester@example.test');
    const photo = await uploadPhoto(requester);
    const reference = await submitServiceRequest(requester, {
      ...aServiceRequest(),
      photoKeys: [photo.objectKey],
    });
    const before = await database.db.execute(
      sql`select id, storage_key, service_request_id from photos`,
    );
    await admin
      .delete(`/api/service-requests/${reference}`)
      .send({ reason: 'Duplicate report' })
      .expect(204);
    app.clock.advance(2 * 24 * 60 * 60 * 1000);
    await app.runDailyCleanup();
    const after = await database.db.execute(
      sql`select id, storage_key, service_request_id from photos`,
    );
    expect(after.rows).toEqual(before.rows);
    expect(app.photoDisk.keys()).toContain(before.rows[0].storage_key);
  });

  it('requires authentication, a completed Administrator account, and a valid existing Reference', async () => {
    await app.browser().delete('/api/service-requests/SR-PLUMB-1').expect(401);
    const pending = await app.signInByLink('pending@example.com');
    await pending.delete('/api/service-requests/SR-PLUMB-1').expect(403);
    const admin = await app.signInAsAdministrator();
    await admin
      .delete('/api/service-requests/invalid')
      .send({ reason: 'Duplicate report' })
      .expect(400);
    await admin
      .delete('/api/service-requests/SR-PLUMB-999')
      .send({ reason: 'Duplicate report' })
      .expect(404);
  });
});
