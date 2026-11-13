import {
  aServiceRequest,
  requestInStatus,
  signInWithRole,
  REQUESTER_ROLES,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Editing Service Request details', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it.each(REQUESTER_ROLES)(
    'allows a %s acting as Requester to edit their own Submitted report',
    async (role) => {
      const requester = await signInWithRole(
        app,
        'requester@example.com',
        role,
      );
      const reference = await submitServiceRequest(requester);
      expect(
        (
          await requester
            .patch(`/api/service-requests/${reference}`)
            .send({ title: 'Corrected title' })
            .expect(200)
        ).body.title,
      ).toBe('Corrected title');
    },
  );

  it('lets an Administrator acting as Requester edit all Submitted details', async () => {
    const admin = await app.signInAsAdministrator();
    const reference = await submitServiceRequest(admin);
    await admin
      .patch(`/api/service-requests/${reference}`)
      .send({
        title: 'Corrected title',
        description: 'A corrected description of the fault.',
      })
      .expect(200);
  });

  it.each(['submitted', 'assigned', 'in_progress'] as const)(
    'allows Administrator corrections to %s category and location without a timeline entry',
    async (status) => {
      const { requester, admin, reference } = await requestInStatus(
        app,
        status,
      );
      const before = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      const corrected = await admin
        .patch(`/api/service-requests/${reference}`)
        .send({ categoryId: 'electrical', location: 'Correct room' })
        .expect(200);
      expect(corrected.body).toMatchObject({
        category: { id: 'electrical' },
        location: 'Correct room',
      });
      expect(corrected.body.timeline).toEqual(before.body.timeline);
      for (const body of [
        { title: 'New title' },
        { description: 'A new description of the fault.' },
      ])
        await admin
          .patch(`/api/service-requests/${reference}`)
          .send(body)
          .expect(403);
    },
  );

  it.each([
    'assigned',
    'in_progress',
    'completed',
    'verified',
    'cancelled',
  ] as const)('refuses Requester editing while %s', async (status) => {
    const { requester, reference } = await requestInStatus(app, status);
    await requester
      .patch(`/api/service-requests/${reference}`)
      .send({ location: 'Another room' })
      .expect(409);
  });

  it.each(['completed', 'verified', 'cancelled'] as const)(
    'refuses Administrator corrections while %s',
    async (status) => {
      const { admin, reference } = await requestInStatus(app, status);
      await admin
        .patch(`/api/service-requests/${reference}`)
        .send({ location: 'Another room' })
        .expect(409);
    },
  );

  it('refuses another Requester, the assigned officer, and an unknown category without partially changing details', async () => {
    const { requester, admin, officer, reference } = await requestInStatus(
      app,
      'assigned',
    );
    const other = await app.signUp('other@example.com');
    await other
      .patch(`/api/service-requests/${reference}`)
      .send({ location: 'Another room' })
      .expect(404);
    await officer
      .patch(`/api/service-requests/${reference}`)
      .send({ location: 'Another room' })
      .expect(403);
    const before = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    const refused = await admin
      .patch(`/api/service-requests/${reference}`)
      .send({ categoryId: 'missing', location: 'Another room' })
      .expect(400);
    expect(refused.body.issues).toEqual([
      { path: ['categoryId'], message: 'No such Request Category' },
    ]);
    expect(
      (await requester.get(`/api/service-requests/${reference}`).expect(200))
        .body,
    ).toEqual(before.body);
  });

  it.each([
    {},
    { title: 'ab' },
    { title: 'x'.repeat(121) },
    { location: 'x' },
    { location: 'x'.repeat(201) },
    { description: 'short' },
    { description: 'x'.repeat(5001) },
    { categoryId: '' },
    { status: 'completed' },
    { priority: 'urgent' },
    { reference: 'SR-ELEC-10' },
    { requesterId: 'other' },
    { photoIds: [] },
  ])('refuses invalid or unsupported edit fields: %j', async (body) => {
    const { requester, reference } = await requestInStatus(app, 'submitted');
    await requester
      .patch(`/api/service-requests/${reference}`)
      .send(body)
      .expect(400);
  });

  it('lets the Requester edit Submitted details without changing its Reference, timeline or category counter', async () => {
    const requester = await app.signUp('requester@example.com');
    const admin = await app.signInAsAdministrator();
    const reference = await submitServiceRequest(requester);
    const before = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    const body = {
      title: '  Faulty light  ',
      categoryId: 'electrical',
      location: ' Room 101 ',
      description: '  The light flickers continuously.  ',
    };
    const edited = await requester
      .patch(`/api/service-requests/${reference}`)
      .send(body)
      .expect(200);
    expect(edited.body).toMatchObject({
      reference: 'SR-PLUMB-1',
      title: 'Faulty light',
      category: { id: 'electrical' },
      location: 'Room 101',
      description: 'The light flickers continuously.',
    });
    expect(edited.body.timeline).toEqual(before.body.timeline);
    expect(edited.body).not.toHaveProperty('priority');
    const next = await submitServiceRequest(
      requester,
      aServiceRequest({ categoryId: 'electrical' }),
    );
    expect(next).toBe('SR-ELEC-1');
    await requester
      .patch(`/api/service-requests/${reference}`)
      .send(body)
      .expect(200);
    const log = await admin.get('/api/activity-log').expect(200);
    const edits = log.body.filter(
      (entry: { action: string }) => entry.action === 'details_changed',
    );
    expect(edits).toEqual([
      expect.objectContaining({
        serviceRequest: { reference },
        details: {
          changes: {
            title: { from: 'Leaking tap', to: 'Faulty light' },
            categoryId: { from: 'plumbing', to: 'electrical' },
            location: { from: 'Block C, ground floor toilets', to: 'Room 101' },
            description: {
              from: aServiceRequest().description,
              to: 'The light flickers continuously.',
            },
          },
        },
      }),
    ]);
  });
});
