import {
  assign,
  idOf,
  requestInStatus,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Setting a Service Request Priority', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it.each(['submitted', 'assigned', 'in_progress'] as const)(
    'accepts every Priority while %s',
    async (status) => {
      const { admin, reference } = await requestInStatus(app, status);
      for (const priority of ['low', 'normal', 'high', 'urgent']) {
        const response = await admin
          .put(`/api/service-requests/${reference}/priority`)
          .send({ priority })
          .expect(200);
        expect(response.body.priority).toBe(priority);
      }
    },
  );

  it.each(['completed', 'verified', 'cancelled'] as const)(
    'refuses Priority changes while %s',
    async (status) => {
      const { admin, reference } = await requestInStatus(app, status);
      await admin
        .put(`/api/service-requests/${reference}/priority`)
        .send({ priority: 'high' })
        .expect(409);
    },
  );

  it('never lets the Requester or current officer set Priority', async () => {
    const { requester, officer, reference } = await requestInStatus(
      app,
      'assigned',
    );
    for (const browser of [requester, officer])
      await browser
        .put(`/api/service-requests/${reference}/priority`)
        .send({ priority: 'high' })
        .expect(403);
  });

  it.each([
    {},
    { priority: null },
    { priority: 'High' },
    { priority: 'emergency' },
  ])('refuses invalid Priority input: %j', async (body) => {
    const { admin, reference } = await requestInStatus(app, 'submitted');
    const refused = await admin
      .put(`/api/service-requests/${reference}/priority`)
      .send(body)
      .expect(400);
    expect(refused.body.issues).toEqual([
      expect.objectContaining({ path: ['priority'] }),
    ]);
  });

  it('lets an Administrator set Priority on Open work, records one change, and shows it only to its current officer and Administrators', async () => {
    const requester = await app.signUp('requester@example.com');
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const reference = await submitServiceRequest(requester);
    await assign(admin, reference, await idOf(officer));
    const before = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    const changed = await admin
      .put(`/api/service-requests/${reference}/priority`)
      .send({ priority: 'urgent' })
      .expect(200);
    expect(changed.body.priority).toBe('urgent');
    expect(changed.body.timeline).toEqual(before.body.timeline);
    await admin
      .put(`/api/service-requests/${reference}/priority`)
      .send({ priority: 'urgent' })
      .expect(200);
    expect(
      (await officer.get(`/api/service-requests/${reference}`).expect(200)).body
        .priority,
    ).toBe('urgent');
    expect(
      (await requester.get(`/api/service-requests/${reference}`).expect(200))
        .body,
    ).not.toHaveProperty('priority');
    const log = await admin.get('/api/activity-log').expect(200);
    expect(
      log.body.filter(
        (entry: { action: string }) => entry.action === 'priority_changed',
      ),
    ).toEqual([
      expect.objectContaining({
        serviceRequest: { reference },
        details: { from: 'normal', to: 'urgent' },
      }),
    ]);
  });
});
