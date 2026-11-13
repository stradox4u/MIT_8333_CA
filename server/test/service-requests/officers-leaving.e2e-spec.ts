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

describe('A Maintenance Officer leaving', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  /**
   * Chinedu holds three requests: one Assigned, one In Progress and one
   * Completed.
   */
  const anOfficerWithWork = async () => {
    const ada = await app.signUp('ada@example.com');
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer(
      'chinedu@example.com',
      { firstName: 'Chinedu', lastName: 'Eze' },
    );
    const officerId = await idOf(officer);
    const assigned = await submitServiceRequest(ada);
    const inProgress = await submitServiceRequest(ada);
    const completed = await submitServiceRequest(ada);
    for (const reference of [assigned, inProgress, completed]) {
      await assign(admin, reference, officerId);
    }
    for (const reference of [inProgress, completed]) {
      await officer.post(`/api/service-requests/${reference}/start`);
    }
    await officer.post(`/api/service-requests/${completed}/complete`);
    app.clock.advance(MINUTE);
    return {
      admin,
      adminId: await idOf(admin),
      officer,
      officerId,
      assigned,
      inProgress,
      completed,
    };
  };

  const show = async (admin: Browser, reference: string) =>
    (await admin.get(`/api/service-requests/${reference}`).expect(200)).body;

  /** Checks the officer's Open requests were handed back, by `actorId`. */
  const expectHandedBack = async (
    admin: Browser,
    work: Awaited<ReturnType<typeof anOfficerWithWork>>,
    actorId: string,
    officerName: string,
  ) => {
    for (const [reference, from] of [
      [work.assigned, 'assigned'],
      [work.inProgress, 'in_progress'],
    ]) {
      const request = await show(admin, reference);
      expect(request).toMatchObject({ status: 'submitted', assignment: null });
      expect(request.timeline.at(-1)).toEqual({
        type: 'assignment',
        occurredAt: '2026-11-12T09:01:00.000Z',
        actor: expect.objectContaining({ id: actorId }),
        change: 'officer_left',
        officer: { id: work.officerId, name: officerName },
        previousOfficer: null,
        statusChange: { fromStatus: from, toStatus: 'submitted' },
      });
    }
    const completed = await show(admin, work.completed);
    expect(completed).toMatchObject({
      status: 'completed',
      assignment: { officer: { id: work.officerId } },
    });

    const log = await admin.get('/api/activity-log').expect(200);
    const handedBack = log.body.filter(
      (entry: { action: string }) => entry.action === 'officer_left',
    );
    expect(handedBack).toHaveLength(2);
    expect(handedBack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: expect.objectContaining({ id: actorId }),
          serviceRequest: { reference: work.assigned },
          details: {
            officerId: work.officerId,
            from: 'assigned',
            to: 'submitted',
          },
        }),
        expect.objectContaining({
          serviceRequest: { reference: work.inProgress },
          details: {
            officerId: work.officerId,
            from: 'in_progress',
            to: 'submitted',
          },
        }),
      ]),
    );
  };

  it('hands back their Open requests when they’re demoted', async () => {
    const work = await anOfficerWithWork();

    await work.admin
      .patch(`/api/users/${work.officerId}/role`)
      .send({ role: 'staff' })
      .expect(200);

    await expectHandedBack(work.admin, work, work.adminId, 'Chinedu Eze');
  });

  it('hands back their Open requests when they’re deactivated', async () => {
    const work = await anOfficerWithWork();

    await work.admin
      .post(`/api/users/${work.officerId}/deactivate`)
      .expect(200);

    await expectHandedBack(work.admin, work, work.adminId, 'Chinedu Eze');
  });

  it('hands back their Open requests when an Administrator erases them', async () => {
    const work = await anOfficerWithWork();

    await work.admin.post(`/api/users/${work.officerId}/erase`).expect(200);

    await expectHandedBack(work.admin, work, work.adminId, 'Erased user');
  });

  it('hands back their Open requests when they erase themselves, as the actor', async () => {
    const work = await anOfficerWithWork();

    await work.officer.delete('/api/me').expect(204);

    await expectHandedBack(work.admin, work, work.officerId, 'Erased user');
  });

  it('lets an Administrator give the handed-back requests to someone else', async () => {
    const work = await anOfficerWithWork();
    await work.admin
      .post(`/api/users/${work.officerId}/deactivate`)
      .expect(200);
    const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');

    const reassigned = await assign(
      work.admin,
      work.inProgress,
      await idOf(ngozi),
    );

    expect(reassigned.body).toMatchObject({
      status: 'assigned',
      assignment: { officer: { id: await idOf(ngozi) } },
    });
  });

  it('changes nothing when someone who isn’t an officer is deactivated', async () => {
    const work = await anOfficerWithWork();
    const student = await app.signUp('student@example.com');

    await work.admin
      .post(`/api/users/${await idOf(student)}/deactivate`)
      .expect(200);

    expect(await show(work.admin, work.assigned)).toMatchObject({
      status: 'assigned',
    });
  });
});
