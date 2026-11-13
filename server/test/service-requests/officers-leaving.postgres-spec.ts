import { createPostgresTestDatabase } from '../support/postgres-test-database.js';
import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Concurrent Service Request work (Postgres)', () => {
  let app: TestApp;
  let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = await createTestApp({ database });
    // Pause a real reassignment just before commit, while it holds the request.
    await database.pool.query(`
      create function pause_reassignment() returns trigger language plpgsql as $$
      begin
        if new.action = 'reassigned' then
          perform pg_advisory_xact_lock(8333, 2);
        end if;
        return new;
      end $$;
      create trigger pause_reassignment before insert on activity_log
        for each row execute function pause_reassignment();
      create function pause_work() returns trigger language plpgsql as $$
      begin
        if new.to_status in ('in_progress', 'completed') then
          perform pg_advisory_xact_lock(8333, 3);
        end if;
        return new;
      end $$;
      create trigger pause_work before insert on status_updates
        for each row execute function pause_work();
    `);
  });
  beforeEach(() => app.reset());
  afterAll(() => app?.close());

  it.each(['start', 'complete'] as const)(
    'finishes concurrent %s and officer erasure without a deadlock',
    async (action) => {
      const requester = await app.signUp('requester@example.com');
      const admin = await app.signInAsAdministrator();
      const officer = await app.signInAsMaintenanceOfficer();
      const officerId = await idOf(officer);
      const reference = await submitServiceRequest(requester);
      await assign(admin, reference, officerId);
      if (action === 'complete') {
        await officer
          .post(`/api/service-requests/${reference}/start`)
          .expect(200);
      }

      const barrier = await database.pool.connect();
      const pending: Promise<unknown>[] = [];
      try {
        await barrier.query('select pg_advisory_lock(8333, 3)');
        const worked = officer
          .post(`/api/service-requests/${reference}/${action}`)
          .then((response) => response);
        pending.push(worked);
        await database.waitForBlockedTransactions(1);
        const erased = admin
          .post(`/api/users/${officerId}/erase`)
          .then((response) => response);
        pending.push(erased);
        await database.waitForBlockedTransactions(2);
        await barrier.query('select pg_advisory_unlock(8333, 3)');
        expect((await worked).status).toBe(200);
        expect((await erased).status).toBe(200);
      } finally {
        await barrier.query('select pg_advisory_unlock_all()');
        barrier.release();
        await Promise.allSettled(pending);
      }

      const shown = await admin
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(shown.body).toMatchObject(
        action === 'start'
          ? { status: 'submitted', assignment: null }
          : {
              status: 'completed',
              assignment: { officer: { id: officerId, name: 'Erased user' } },
            },
      );
      expect(shown.body.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'status_update',
            toStatus: action === 'start' ? 'in_progress' : 'completed',
            actor: { id: officerId, name: 'Erased user' },
          }),
        ]),
      );
      const users = await admin.get('/api/users').expect(200);
      expect(users.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: officerId, status: 'erased' }),
        ]),
      );
    },
  );

  it('drops its temporary database when application compilation fails', async () => {
    const failed = await createPostgresTestDatabase();
    const result = await failed.pool.query<{ name: string }>(
      'select current_database() as name',
    );
    const name = result.rows[0].name;
    const remaining = () =>
      database.pool.query(
        'select datname from pg_database where datname = $1',
        [name],
      );
    try {
      await expect(
        createTestApp({ database: failed, config: { appUrl: 'invalid' } }),
      ).rejects.toThrow(/Invalid URL/);
      expect((await remaining()).rows).toEqual([]);
    } finally {
      if ((await remaining()).rows.length) await failed.close();
    }
  });

  it.each(['assigned', 'in_progress'] as const)(
    'keeps a reassigned %s request with its new officer when its previous officer leaves',
    async (status) => {
      const requester = await app.signUp('requester@example.com');
      const admin = await app.signInAsAdministrator();
      const previous = await app.signInAsMaintenanceOfficer(
        'previous@example.com',
      );
      const next = await app.signInAsMaintenanceOfficer('next@example.com');
      const previousId = await idOf(previous);
      const nextId = await idOf(next);
      const reference = await submitServiceRequest(requester);
      await assign(admin, reference, previousId);
      if (status === 'in_progress') {
        await previous
          .post(`/api/service-requests/${reference}/start`)
          .expect(200);
      }

      const barrier = await database.pool.connect();
      const pending: Promise<unknown>[] = [];
      try {
        await barrier.query('select pg_advisory_lock(8333, 2)');
        const reassigned = admin
          .put(`/api/service-requests/${reference}/assignment`)
          .send({ officerId: nextId })
          .then((response) => response);
        pending.push(reassigned);
        await database.waitForBlockedTransactions(1);
        const departed = admin
          .post(`/api/users/${previousId}/deactivate`)
          .then((response) => response);
        pending.push(departed);
        await database.waitForBlockedTransactions(2);
        await barrier.query('select pg_advisory_unlock(8333, 2)');
        expect((await reassigned).status).toBe(200);
        expect((await departed).status).toBe(200);
      } finally {
        await barrier.query('select pg_advisory_unlock_all()');
        barrier.release();
        await Promise.allSettled(pending);
      }

      const shown = await admin
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(shown.body).toMatchObject({
        status: 'assigned',
        assignment: { officer: { id: nextId } },
      });
      expect(shown.body.timeline.at(-1)).toMatchObject({
        change: 'reassigned',
        officer: { id: nextId },
        previousOfficer: { id: previousId },
      });
      expect(shown.body.timeline).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ change: 'officer_left' }),
        ]),
      );
      const log = await admin.get('/api/activity-log').expect(200);
      expect(log.body).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'officer_left' }),
        ]),
      );
      await next.post(`/api/service-requests/${reference}/start`).expect(200);
      await next
        .post(`/api/service-requests/${reference}/complete`)
        .expect(200);
    },
  );
});
