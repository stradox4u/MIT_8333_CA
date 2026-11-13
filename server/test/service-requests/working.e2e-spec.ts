import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import {
  type Browser,
  createTestApp,
  type TestApp,
} from '../support/test-app.js';

const MINUTE = 60 * 1000;

describe('Working on a Service Request', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  /** A request an Administrator has given to Chinedu, a Maintenance Officer. */
  const anAssignedRequest = async () => {
    const requester = await app.signUp('ada@example.com', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const reference = await submitServiceRequest(requester);
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer(
      'chinedu@example.com',
      { firstName: 'Chinedu', lastName: 'Eze' },
    );
    const officerId = await idOf(officer);
    await assign(admin, reference, officerId);
    return { requester, reference, admin, officer, officerId };
  };

  const start = (browser: Browser, reference: string) =>
    browser.post(`/api/service-requests/${reference}/start`);
  const complete = (browser: Browser, reference: string, body = {}) =>
    browser.post(`/api/service-requests/${reference}/complete`).send(body);

  it('shows the request to its current officer, with its Priority', async () => {
    const { reference, officer } = await anAssignedRequest();

    const shown = await officer
      .get(`/api/service-requests/${reference}`)
      .expect(200);

    expect(shown.body).toMatchObject({
      status: 'assigned',
      priority: 'normal',
    });
  });

  it('lets the current officer start it, moving it to In Progress', async () => {
    const { reference, officer, officerId } = await anAssignedRequest();
    app.clock.advance(MINUTE);

    const started = await start(officer, reference).expect(200);

    expect(started.body.status).toBe('in_progress');
    expect(started.body.timeline.at(-1)).toEqual({
      type: 'status_update',
      occurredAt: '2026-11-12T09:01:00.000Z',
      actor: { id: officerId, name: 'Chinedu Eze' },
      fromStatus: 'assigned',
      toStatus: 'in_progress',
      reason: null,
      note: null,
    });
  });

  it('lets the current officer complete it, keeping their note on that Status Update', async () => {
    const { reference, officer, officerId } = await anAssignedRequest();
    await start(officer, reference).expect(200);
    app.clock.advance(MINUTE);

    const completed = await complete(officer, reference, {
      note: '  Replaced the washer.  ',
    }).expect(200);

    expect(completed.body).toMatchObject({
      status: 'completed',
      assignment: { officer: { id: officerId } },
    });
    expect(completed.body.timeline.at(-1)).toEqual({
      type: 'status_update',
      occurredAt: '2026-11-12T09:01:00.000Z',
      actor: { id: officerId, name: 'Chinedu Eze' },
      fromStatus: 'in_progress',
      toStatus: 'completed',
      reason: null,
      note: 'Replaced the washer.',
    });
  });

  it('completes it without a note', async () => {
    const { reference, officer } = await anAssignedRequest();
    await start(officer, reference).expect(200);

    const completed = await complete(officer, reference).expect(200);

    expect(completed.body.timeline.at(-1)).toMatchObject({
      toStatus: 'completed',
      note: null,
    });
  });

  it.each([
    ['empty', '   '],
    ['over 2,000 characters', 'a'.repeat(2001)],
  ])('refuses a note that’s %s', async (_why, note) => {
    const { reference, officer } = await anAssignedRequest();
    await start(officer, reference).expect(200);

    const refused = await complete(officer, reference, { note }).expect(400);

    expect(refused.body.issues).toEqual([
      { path: ['note'], message: expect.any(String) },
    ]);
  });

  it('shows the timeline oldest first', async () => {
    const { reference, officer } = await anAssignedRequest();
    app.clock.advance(MINUTE);
    await start(officer, reference).expect(200);
    app.clock.advance(MINUTE);
    await complete(officer, reference).expect(200);

    const shown = await officer.get(`/api/service-requests/${reference}`);

    expect(
      shown.body.timeline.map(
        (entry: { type: string; toStatus?: string; change?: string }) =>
          entry.toStatus ?? entry.change,
      ),
    ).toEqual(['submitted', 'assigned', 'in_progress', 'completed']);
  });

  it('keeps entries at the same instant in the order they happened', async () => {
    const { reference, admin, officer, officerId } = await anAssignedRequest();
    await admin
      .delete(`/api/service-requests/${reference}/assignment`)
      .expect(200);
    await assign(admin, reference, officerId);
    await start(officer, reference).expect(200);

    const shown = await officer.get(`/api/service-requests/${reference}`);

    expect(
      shown.body.timeline.map(
        (entry: { toStatus?: string; change?: string }) =>
          entry.change ?? entry.toStatus,
      ),
    ).toEqual([
      'submitted',
      'assigned',
      'unassigned',
      'assigned',
      'in_progress',
    ]);
  });

  describe('is only for the current officer', () => {
    it('not an Administrator', async () => {
      const { reference, admin, officer } = await anAssignedRequest();

      await start(admin, reference).expect(403);
      await start(officer, reference).expect(200);
      await complete(admin, reference).expect(403);
    });

    it('not the Requester', async () => {
      const { requester, reference } = await anAssignedRequest();

      await start(requester, reference).expect(403);
    });

    it('not another officer, who can’t see it at all', async () => {
      const { reference } = await anAssignedRequest();
      const other = await app.signInAsMaintenanceOfficer('ngozi@example.com');

      await other.get(`/api/service-requests/${reference}`).expect(404);
      await start(other, reference).expect(404);
    });
  });

  describe('answers 409 when the Status doesn’t fit', () => {
    it('starting what’s already In Progress', async () => {
      const { reference, officer } = await anAssignedRequest();
      await start(officer, reference).expect(200);

      const refused = await start(officer, reference).expect(409);

      expect(refused.body.message).toMatch(/In Progress/);
    });

    it('completing what hasn’t been started', async () => {
      const { reference, officer } = await anAssignedRequest();

      const refused = await complete(officer, reference).expect(409);

      expect(refused.body.message).toMatch(/Assigned/);
    });

    it('assigning or unassigning a Completed request, which keeps its Assignment', async () => {
      const { reference, admin, officer } = await anAssignedRequest();
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      await start(officer, reference).expect(200);
      await complete(officer, reference).expect(200);

      await admin
        .put(`/api/service-requests/${reference}/assignment`)
        .send({ officerId: await idOf(ngozi) })
        .expect(409);
      await admin
        .delete(`/api/service-requests/${reference}/assignment`)
        .expect(409);
    });
  });

  describe('reassigning', () => {
    it('an In Progress request moves it back to Assigned, for the new officer to start', async () => {
      const { reference, admin, officer, officerId } =
        await anAssignedRequest();
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com', {
        firstName: 'Ngozi',
        lastName: 'Okafor',
      });
      const ngoziId = await idOf(ngozi);
      await start(officer, reference).expect(200);
      app.clock.advance(MINUTE);

      const reassigned = await assign(admin, reference, ngoziId);

      expect(reassigned.body.status).toBe('assigned');
      expect(reassigned.body.timeline.at(-1)).toMatchObject({
        type: 'assignment',
        change: 'reassigned',
        officer: { id: ngoziId, name: 'Ngozi Okafor' },
        previousOfficer: { id: officerId, name: 'Chinedu Eze' },
        statusUpdate: { fromStatus: 'in_progress', toStatus: 'assigned' },
      });
      await start(ngozi, reference).expect(200);
    });

    it('leaves the previous officer able to read it, without its Priority, but not act on it', async () => {
      const { reference, admin, officer } = await anAssignedRequest();
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      await assign(admin, reference, await idOf(ngozi));

      const shown = await officer
        .get(`/api/service-requests/${reference}`)
        .expect(200);

      expect(shown.body).not.toHaveProperty('priority');
      await start(officer, reference).expect(403);
      await start(ngozi, reference).expect(200);
      await complete(officer, reference).expect(403);
    });
  });
});
