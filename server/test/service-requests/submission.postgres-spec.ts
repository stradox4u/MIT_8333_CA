import { createPostgresTestDatabase } from '../support/postgres-test-database.js';
import { aServiceRequest } from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Submitted time under category contention (Postgres)', () => {
  let app: TestApp;
  let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = await createTestApp({ database });
  });
  afterAll(() => app?.close());

  it('timestamps the request and history after acquiring its Reference counter lock', async () => {
    const requester = await app.signUp('requester@example.com');
    const barrier = await database.pool.connect();
    let submitted:
      Promise<{ body: { reference: string }; status: number }> | undefined;
    try {
      await barrier.query('begin');
      await barrier.query(
        "select id from request_categories where id = 'plumbing' for update",
      );
      submitted = requester
        .post('/api/service-requests')
        .send(aServiceRequest())
        .then((response) => response);
      await database.waitForBlockedTransactions(1);
      app.clock.advance(60_000);
      const expected = new Date(app.clock.now()).toISOString();
      await barrier.query('commit');
      const created = await submitted;
      expect(created.status).toBe(201);
      const details = await requester
        .get(`/api/service-requests/${created.body.reference}`)
        .expect(200);
      expect(details.body.submittedAt).toBe(expected);
      expect(details.body.timeline[0].occurredAt).toBe(expected);
    } finally {
      await barrier.query('rollback');
      barrier.release();
      await submitted;
    }
  });
});
