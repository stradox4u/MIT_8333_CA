import { createPostgresTestDatabase } from '../support/postgres-test-database.js';
import { requestInStatus } from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Closing Service Requests concurrently (Postgres)', () => {
  let app: TestApp;
  let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = await createTestApp({ database });
    await database.pool.query(`
      create function pause_not_fixed() returns trigger language plpgsql as $$
      begin
        if new.from_status = 'completed' and new.to_status = 'assigned' then
          perform pg_advisory_xact_lock(8333, 4);
        end if;
        return new;
      end $$;
      create trigger pause_not_fixed before insert on status_updates
        for each row execute function pause_not_fixed();
    `);
  });
  beforeEach(() => app.reset());
  afterAll(() => app?.close());

  it.each(['verify', 'not-fixed', 'cancel', 'edit', 'priority'] as const)(
    'rolls back %s and its history when writing the Activity Log fails',
    async (action) => {
      const initial =
        action === 'verify' || action === 'not-fixed'
          ? 'completed'
          : action === 'cancel'
            ? 'assigned'
            : 'submitted';
      const { requester, admin, officerId, reference } = await requestInStatus(
        app,
        initial,
      );
      if (action === 'not-fixed')
        await admin.post(`/api/users/${officerId}/deactivate`).expect(200);
      const before = await admin
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      const logBefore = await admin.get('/api/activity-log').expect(200);
      await database.pool.query(`
      create function fail_activity() returns trigger language plpgsql as $$
      begin raise exception 'Test Activity Log failure'; end $$;
      create trigger fail_activity before insert on activity_log
        for each row execute function fail_activity();
    `);
      try {
        if (action === 'edit')
          await requester
            .patch(`/api/service-requests/${reference}`)
            .send({ location: 'Correct room' })
            .expect(500);
        else if (action === 'priority')
          await admin
            .put(`/api/service-requests/${reference}/priority`)
            .send({ priority: 'urgent' })
            .expect(500);
        else
          await (action === 'cancel' ? admin : requester)
            .post(`/api/service-requests/${reference}/${action}`)
            .send({ reason: 'The tap still leaks.' })
            .expect(500);
      } finally {
        await database.pool.query(
          'drop trigger fail_activity on activity_log; drop function fail_activity()',
        );
      }
      expect(
        (await admin.get(`/api/service-requests/${reference}`).expect(200))
          .body,
      ).toEqual(before.body);
      expect((await admin.get('/api/activity-log').expect(200)).body).toEqual(
        logBefore.body,
      );
    },
  );

  it('hands work back when an officer leaves while the Requester answers Not fixed', async () => {
    const { requester, admin, officerId, reference } = await requestInStatus(
      app,
      'completed',
    );
    const barrier = await database.pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await barrier.query('select pg_advisory_lock(8333, 4)');
      const answered = requester
        .post(`/api/service-requests/${reference}/not-fixed`)
        .send({ reason: 'Still leaking.' })
        .then((response) => response);
      pending.push(answered);
      await database.waitForBlockedTransactions(1);
      const removed = admin
        .post(`/api/users/${officerId}/deactivate`)
        .then((response) => response);
      pending.push(removed);
      // The old departure query could finish without seeing the uncommitted reopening.
      const waiting = database
        .waitForBlockedTransactions(2)
        .catch(() => undefined);
      pending.push(waiting);
      await Promise.race([removed, waiting]);
      await barrier.query('select pg_advisory_unlock(8333, 4)');
      expect((await answered).status).toBe(200);
      expect((await removed).status).toBe(200);
    } finally {
      await barrier.query('select pg_advisory_unlock_all()');
      barrier.release();
      await Promise.allSettled(pending);
    }
    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body).toMatchObject({ status: 'submitted', assignment: null });
    expect(shown.body.timeline.at(-1)).toMatchObject({
      change: 'officer_left',
      statusUpdate: { fromStatus: 'assigned', toStatus: 'submitted' },
    });
  });

  it('rechecks automatic verification after a concurrent Not fixed answer', async () => {
    const { reference, officerId } = await requestInStatus(app, 'completed');
    app.clock.advance(7 * 24 * 60 * 60 * 1000);
    const requester = await app.signInByLink('requester@example.com');
    const barrier = await database.pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await barrier.query('select pg_advisory_lock(8333, 4)');
      const answered = requester
        .post(`/api/service-requests/${reference}/not-fixed`)
        .send({ reason: 'Still leaking.' })
        .then((response) => response);
      pending.push(answered);
      await database.waitForBlockedTransactions(1);
      const cleanup = app.runDailyCleanup();
      pending.push(cleanup);
      await database.waitForBlockedTransactions(2);
      await barrier.query('select pg_advisory_unlock(8333, 4)');
      expect((await answered).status).toBe(200);
      await cleanup;
    } finally {
      await barrier.query('select pg_advisory_unlock_all()');
      barrier.release();
      await Promise.allSettled(pending);
    }
    const shown = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body).toMatchObject({
      status: 'assigned',
      assignment: { officer: { id: officerId } },
    });
    expect(
      shown.body.timeline.map((entry: { toStatus?: string }) => entry.toStatus),
    ).not.toContain('verified');
  });

  it('records one verification when the Requester and an Administrator answer together', async () => {
    const { requester, admin, reference } = await requestInStatus(
      app,
      'completed',
    );
    const responses = await Promise.all(
      [requester, admin].map((browser) =>
        browser.post(`/api/service-requests/${reference}/verify`),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(
      shown.body.timeline.filter(
        (entry: { toStatus?: string }) => entry.toStatus === 'verified',
      ),
    ).toHaveLength(1);
    const log = await admin.get('/api/activity-log').expect(200);
    expect(
      log.body.filter(
        (entry: { details?: { to?: string } }) =>
          entry.details?.to === 'verified',
      ),
    ).toHaveLength(1);
  });

  it('does not duplicate demonstration requests when seed commands overlap', async () => {
    const demo = {
      domain: 'concurrent.demo.test',
      password: 'Demo-Password-2026',
    };
    await Promise.all([app.seedDemoAccounts(demo), app.seedDemoAccounts(demo)]);
    const admin = app.browser();
    await admin
      .post('/api/auth/sign-in')
      .send({ email: `administrator@${demo.domain}`, password: demo.password })
      .expect(200);
    const shown = await admin
      .get('/api/service-requests?scope=all')
      .expect(200);
    expect(shown.body.total).toBe(12);
    expect(
      new Set(
        shown.body.items.map(
          (request: { reference: string }) => request.reference,
        ),
      ).size,
    ).toBe(12);
  });
});
