import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const MINUTE = 60 * 1000;

describe('Assigning a Service Request', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  /** A Submitted request, an Administrator, and an active Maintenance Officer. */
  const aSubmittedRequest = async () => {
    const requester = await app.signUp('ada@example.com');
    const reference = await submitServiceRequest(requester);
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer(
      'chinedu@example.com',
      { firstName: 'Chinedu', lastName: 'Eze' },
    );
    return {
      requester,
      reference,
      admin,
      adminId: await idOf(admin),
      officer,
      officerId: await idOf(officer),
    };
  };

  it('gives a Submitted request to an active Maintenance Officer, moving it to Assigned', async () => {
    const { reference, admin, adminId, officerId } = await aSubmittedRequest();
    app.clock.advance(MINUTE);

    const assigned = await assign(admin, reference, officerId);

    expect(assigned.body).toMatchObject({
      reference,
      status: 'assigned',
      assignment: {
        officer: { id: officerId, name: 'Chinedu Eze' },
        assignedAt: '2026-11-12T09:01:00.000Z',
      },
    });
    expect(assigned.body.timeline).toEqual([
      expect.objectContaining({ type: 'status_update', toStatus: 'submitted' }),
      {
        type: 'assignment',
        occurredAt: '2026-11-12T09:01:00.000Z',
        actor: { id: adminId, name: 'Grace Hopper' },
        change: 'assigned',
        officer: { id: officerId, name: 'Chinedu Eze' },
        previousOfficer: null,
        statusChange: { fromStatus: 'submitted', toStatus: 'assigned' },
      },
    ]);
  });

  it('shows a request with no Assignment as having none', async () => {
    const { reference, admin } = await aSubmittedRequest();

    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);

    expect(shown.body.assignment).toBeNull();
  });

  describe('refuses an officerId that isn’t an active Maintenance Officer', () => {
    const refusesOfficer = async (officerId: string) => {
      const { reference, admin } = await aSubmittedRequest();

      const refused = await admin
        .put(`/api/service-requests/${reference}/assignment`)
        .send({ officerId })
        .expect(400);

      expect(refused.body.issues).toEqual([
        { path: ['officerId'], message: expect.any(String) },
      ]);
      const shown = await admin.get(`/api/service-requests/${reference}`);
      expect(shown.body).toMatchObject({
        status: 'submitted',
        assignment: null,
      });
    };

    it('such as a Student', async () => {
      const student = await app.signUp('student@example.com');
      await refusesOfficer(await idOf(student));
    });

    it('such as nobody at all', async () => {
      await refusesOfficer('00000000-0000-4000-8000-000000000000');
    });

    it('such as an invited officer who has never signed in', async () => {
      const inviter = await app.signInAsAdministrator('inviter@example.com');
      const invited = await inviter
        .post('/api/users')
        .send({
          firstName: 'Ngozi',
          lastName: 'Okafor',
          email: 'ngozi@example.com',
          role: 'maintenance_officer',
        })
        .expect(201);
      await refusesOfficer(invited.body.id);
    });

    it('such as a deactivated officer', async () => {
      const inviter = await app.signInAsAdministrator('inviter@example.com');
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      const ngoziId = await idOf(ngozi);
      await inviter.post(`/api/users/${ngoziId}/deactivate`).expect(200);
      await refusesOfficer(ngoziId);
    });

    it('such as something that isn’t an id', async () => {
      const { reference, admin } = await aSubmittedRequest();

      await admin
        .put(`/api/service-requests/${reference}/assignment`)
        .send({ officerId: 'chinedu' })
        .expect(400);
    });
  });

  it('is only for Administrators', async () => {
    const { requester, reference, officer, officerId } =
      await aSubmittedRequest();

    for (const browser of [requester, officer]) {
      await browser
        .put(`/api/service-requests/${reference}/assignment`)
        .send({ officerId })
        .expect(403);
    }
  });

  it('answers 404 for a Reference nobody has', async () => {
    const { admin, officerId } = await aSubmittedRequest();

    await admin
      .put('/api/service-requests/SR-PLUMB-999/assignment')
      .send({ officerId })
      .expect(404);
  });

  describe('reassigning', () => {
    it('gives an Assigned request to another officer, which stays Assigned', async () => {
      const { reference, admin, adminId, officerId } =
        await aSubmittedRequest();
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com', {
        firstName: 'Ngozi',
        lastName: 'Okafor',
      });
      const ngoziId = await idOf(ngozi);
      app.clock.advance(MINUTE);
      await assign(admin, reference, officerId);
      app.clock.advance(MINUTE);

      const reassigned = await assign(admin, reference, ngoziId);

      expect(reassigned.body).toMatchObject({
        status: 'assigned',
        assignment: {
          officer: { id: ngoziId, name: 'Ngozi Okafor' },
          assignedAt: '2026-11-12T09:02:00.000Z',
        },
      });
      expect(reassigned.body.timeline).toHaveLength(3);
      expect(reassigned.body.timeline[2]).toEqual({
        type: 'assignment',
        occurredAt: '2026-11-12T09:02:00.000Z',
        actor: { id: adminId, name: 'Grace Hopper' },
        change: 'reassigned',
        officer: { id: ngoziId, name: 'Ngozi Okafor' },
        previousOfficer: { id: officerId, name: 'Chinedu Eze' },
        statusChange: null,
      });
    });

    it('to the same officer changes nothing', async () => {
      const { reference, admin, officerId } = await aSubmittedRequest();
      const assigned = await assign(admin, reference, officerId);
      app.clock.advance(MINUTE);

      const again = await assign(admin, reference, officerId);

      expect(again.body).toEqual(assigned.body);
    });
  });

  describe('unassigning', () => {
    it('ends the Assignment and moves the request back to Submitted', async () => {
      const { reference, admin, adminId, officerId } =
        await aSubmittedRequest();
      await assign(admin, reference, officerId);
      app.clock.advance(MINUTE);

      const unassigned = await admin
        .delete(`/api/service-requests/${reference}/assignment`)
        .expect(200);

      expect(unassigned.body).toMatchObject({
        status: 'submitted',
        assignment: null,
      });
      expect(unassigned.body.timeline.at(-1)).toEqual({
        type: 'assignment',
        occurredAt: '2026-11-12T09:01:00.000Z',
        actor: { id: adminId, name: 'Grace Hopper' },
        change: 'unassigned',
        officer: { id: officerId, name: 'Chinedu Eze' },
        previousOfficer: null,
        statusChange: { fromStatus: 'assigned', toStatus: 'submitted' },
      });
    });

    it('answers 409 when the request has no Assignment', async () => {
      const { reference, admin } = await aSubmittedRequest();

      const refused = await admin
        .delete(`/api/service-requests/${reference}/assignment`)
        .expect(409);

      expect(refused.body.message).toMatch(/Submitted/);
    });

    it('is only for Administrators', async () => {
      const { requester, reference, admin, officer, officerId } =
        await aSubmittedRequest();
      await assign(admin, reference, officerId);

      for (const browser of [requester, officer]) {
        await browser
          .delete(`/api/service-requests/${reference}/assignment`)
          .expect(403);
      }
    });
  });
});
