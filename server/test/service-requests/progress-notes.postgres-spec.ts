import { createPostgresTestDatabase } from '../support/postgres-test-database.js';
import { idOf, requestInStatus } from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Progress Notes during concurrent lifecycle changes (Postgres)', () => {
  let app: TestApp;
  let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = await createTestApp({ database });
  });
  beforeEach(() => app.reset());
  afterAll(() => app?.close());

  it.each(['reassign', 'verify'] as const)(
    'rechecks permissions and Status after a queued %s',
    async (action) => {
      const { requester, officer, admin, reference } = await requestInStatus(
        app,
        action === 'verify' ? 'completed' : 'assigned',
      );
      const next = await app.signInAsMaintenanceOfficer('next@example.com');
      const nextId = await idOf(next);
      const barrier = await database.pool.connect();
      const pending: Promise<unknown>[] = [];
      try {
        await barrier.query('begin');
        await barrier.query(
          'select id from service_requests where reference = $1 for update',
          [reference],
        );
        const changed = (
          action === 'verify'
            ? requester.post(`/api/service-requests/${reference}/verify`)
            : admin
                .put(`/api/service-requests/${reference}/assignment`)
                .send({ officerId: nextId })
        ).then((response) => response);
        pending.push(changed);
        await database.waitForBlockedTransactions(1);
        const added = officer
          .post(`/api/service-requests/${reference}/progress-notes`)
          .send({ text: 'This must not be saved.' })
          .then((response) => response);
        pending.push(added);
        await database.waitForBlockedTransactions(2);
        await barrier.query('commit');
        expect((await changed).status).toBe(200);
        expect((await added).status).toBe(action === 'verify' ? 409 : 403);
      } finally {
        await barrier.query('rollback');
        barrier.release();
        await Promise.allSettled(pending);
      }
      const shown = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(
        shown.body.timeline.filter(
          (entry: { type: string }) => entry.type === 'progress_note',
        ),
      ).toEqual([]);
    },
  );

  it.each(['deactivate', 'erase', 'demote'] as const)(
    'rechecks author access after a concurrent %s',
    async (action) => {
      const { requester, officer, officerId, admin, reference } =
        await requestInStatus(app, 'assigned');
      const barrier = await database.pool.connect();
      const pending: Promise<unknown>[] = [];
      try {
        await barrier.query('begin');
        await barrier.query('select id from users where id = $1 for update', [
          officerId,
        ]);
        const changed = (
          action === 'demote'
            ? admin
                .patch(`/api/users/${officerId}/role`)
                .send({ role: 'staff' })
            : admin.post(`/api/users/${officerId}/${action}`)
        ).then((response) => response);
        pending.push(changed);
        await database.waitForBlockedTransactions(1);
        const added = officer
          .post(`/api/service-requests/${reference}/progress-notes`)
          .send({ text: 'No longer authorized.' })
          .then((response) => response);
        pending.push(added);
        await database.waitForBlockedTransactions(2);
        await barrier.query('commit');
        expect((await changed).status).toBe(200);
        expect((await added).status).toBe(403);
      } finally {
        await barrier.query('rollback');
        barrier.release();
        await Promise.allSettled(pending);
      }
      const shown = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(
        shown.body.timeline.filter(
          (entry: { type: string }) => entry.type === 'progress_note',
        ),
      ).toEqual([]);
    },
  );

  it('keeps both concurrently appended notes in the timeline', async () => {
    const { requester, admin, reference } = await requestInStatus(
      app,
      'submitted',
    );
    const added = await Promise.all(
      [requester, admin].map((author, index) =>
        author
          .post(`/api/service-requests/${reference}/progress-notes`)
          .send({ text: `Note ${index + 1}` }),
      ),
    );
    expect(added.map((response) => response.status)).toEqual([201, 201]);
    const shown = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(
      shown.body.timeline
        .slice(1)
        .map((entry: { text: string }) => entry.text)
        .sort(),
    ).toEqual(['Note 1', 'Note 2']);
  });
});
