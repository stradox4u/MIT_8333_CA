import { createPostgresTestDatabase } from '../support/postgres-test-database.js';
import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('An officer leaving during reassignment (Postgres)', () => {
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
    `);
  });
  beforeEach(() => app.reset());
  afterAll(() => app?.close());

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
