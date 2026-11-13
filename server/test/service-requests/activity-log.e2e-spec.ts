import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const MINUTE = 60 * 1000;

describe('The Activity Log of Service Requests', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('records every Status Update and Assignment change, naming the request, newest first', async () => {
    const ada = await app.signUp('ada@example.com', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const admin = await app.signInAsAdministrator();
    const chinedu = await app.signInAsMaintenanceOfficer(
      'chinedu@example.com',
      { firstName: 'Chinedu', lastName: 'Eze' },
    );
    const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
    const [adaId, adminId, chineduId, ngoziId] = await Promise.all(
      [ada, admin, chinedu, ngozi].map(idOf),
    );
    const reference = await submitServiceRequest(ada);
    app.clock.advance(MINUTE);
    await assign(admin, reference, chineduId);
    app.clock.advance(MINUTE);
    await chinedu.post(`/api/service-requests/${reference}/start`).expect(200);
    app.clock.advance(MINUTE);
    await assign(admin, reference, ngoziId);
    app.clock.advance(MINUTE);
    await admin
      .delete(`/api/service-requests/${reference}/assignment`)
      .expect(200);

    const log = await admin.get('/api/activity-log').expect(200);

    const request = { reference };
    expect(log.body).toEqual([
      expect.objectContaining({
        occurredAt: '2026-11-12T09:04:00.000Z',
        action: 'unassigned',
        actor: { id: adminId, name: 'Grace Hopper' },
        target: null,
        serviceRequest: request,
        details: { officerId: ngoziId, from: 'assigned', to: 'submitted' },
      }),
      expect.objectContaining({
        action: 'reassigned',
        serviceRequest: request,
        details: {
          officerId: ngoziId,
          previousOfficerId: chineduId,
          from: 'in_progress',
          to: 'assigned',
        },
      }),
      expect.objectContaining({
        action: 'status_changed',
        actor: { id: chineduId, name: 'Chinedu Eze' },
        serviceRequest: request,
        details: { from: 'assigned', to: 'in_progress' },
      }),
      expect.objectContaining({
        action: 'assigned',
        serviceRequest: request,
        details: { officerId: chineduId, from: 'submitted', to: 'assigned' },
      }),
      expect.objectContaining({
        occurredAt: '2026-11-12T09:00:00.000Z',
        action: 'status_changed',
        actor: { id: adaId, name: 'Ada Lovelace' },
        target: null,
        serviceRequest: request,
        details: { from: null, to: 'submitted' },
      }),
    ]);
    expect(log.body[0]).toHaveProperty('id');
  });

  it('records completing, and a reassignment that changes no Status', async () => {
    const ada = await app.signUp('ada@example.com');
    const admin = await app.signInAsAdministrator();
    const chinedu = await app.signInAsMaintenanceOfficer('chinedu@example.com');
    const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
    const reference = await submitServiceRequest(ada);
    await assign(admin, reference, await idOf(chinedu));
    app.clock.advance(MINUTE);
    await assign(admin, reference, await idOf(ngozi));
    app.clock.advance(MINUTE);
    await ngozi.post(`/api/service-requests/${reference}/start`).expect(200);
    app.clock.advance(MINUTE);
    await ngozi
      .post(`/api/service-requests/${reference}/complete`)
      .send({ note: 'Fixed.' })
      .expect(200);

    const log = await admin.get('/api/activity-log').expect(200);

    expect(log.body.slice(0, 3)).toMatchObject([
      {
        action: 'status_changed',
        details: { from: 'in_progress', to: 'completed' },
      },
      {
        action: 'status_changed',
        details: { from: 'assigned', to: 'in_progress' },
      },
      {
        action: 'reassigned',
        details: {
          officerId: await idOf(ngozi),
          previousOfficerId: await idOf(chinedu),
        },
      },
    ]);
    expect(log.body[2].details).not.toHaveProperty('from');
  });

  it('records nothing when giving a request to the officer who holds it', async () => {
    const ada = await app.signUp('ada@example.com');
    const admin = await app.signInAsAdministrator();
    const officerId = await idOf(await app.signInAsMaintenanceOfficer());
    const reference = await submitServiceRequest(ada);
    await assign(admin, reference, officerId);

    await assign(admin, reference, officerId);

    const log = await admin.get('/api/activity-log').expect(200);
    expect(log.body.map((entry: { action: string }) => entry.action)).toEqual([
      'assigned',
      'status_changed',
    ]);
  });

  it('keeps User entries naming their target, with no Service Request', async () => {
    const admin = await app.signInAsAdministrator();
    const ada = await app.signUp('ada@example.com');
    const adaId = await idOf(ada);
    await admin.post(`/api/users/${adaId}/deactivate`).expect(200);

    const log = await admin.get('/api/activity-log').expect(200);

    expect(log.body).toEqual([
      expect.objectContaining({
        action: 'deactivated',
        target: { id: adaId, name: 'Ada Lovelace' },
        serviceRequest: null,
      }),
    ]);
  });
});
