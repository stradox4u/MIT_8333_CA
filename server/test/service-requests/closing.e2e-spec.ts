import {
  assign,
  idOf,
  requestInStatus,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Closing the loop on Service Requests', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const completedRequest = () => requestInStatus(app, 'completed');

  it('allows Administrator verification but refuses an officer and hides it from another Requester', async () => {
    const { admin, officer, reference } = await completedRequest();
    await officer.post(`/api/service-requests/${reference}/verify`).expect(403);
    await admin
      .post(`/api/service-requests/${reference}/not-fixed`)
      .send({ reason: 'Still leaking.' })
      .expect(403);
    const other = await app.signUp('other@example.com');
    for (const action of ['verify', 'not-fixed', 'cancel']) {
      await other
        .post(`/api/service-requests/${reference}/${action}`)
        .send({ reason: 'Still leaking.' })
        .expect(404);
    }
    await admin.post(`/api/service-requests/${reference}/verify`).expect(200);
  });

  it.each([
    'submitted',
    'assigned',
    'in_progress',
    'verified',
    'cancelled',
  ] as const)(
    'refuses verification and Not fixed when the request is %s',
    async (status) => {
      const { requester, reference } = await requestInStatus(app, status);
      await requester
        .post(`/api/service-requests/${reference}/verify`)
        .expect(409);
      await requester
        .post(`/api/service-requests/${reference}/not-fixed`)
        .send({ reason: 'Still leaking.' })
        .expect(409);
    },
  );

  it.each([
    'assigned',
    'in_progress',
    'completed',
    'verified',
    'cancelled',
  ] as const)('refuses Requester cancellation while %s', async (status) => {
    const { requester, reference } = await requestInStatus(app, status);
    await requester
      .post(`/api/service-requests/${reference}/cancel`)
      .send({ reason: 'No longer needed.' })
      .expect(409);
  });

  it.each(['completed', 'verified', 'cancelled'] as const)(
    'refuses Administrator cancellation while %s',
    async (status) => {
      const { admin, reference } = await requestInStatus(app, status);
      await admin
        .post(`/api/service-requests/${reference}/cancel`)
        .send({ reason: 'No longer needed.' })
        .expect(409);
    },
  );

  it('lets a Requester cancel Submitted work, while the officer cannot cancel work they hold', async () => {
    const { requester, officer, admin, officerId, reference } =
      await requestInStatus(app, 'submitted');
    const cancelled = await requester
      .post(`/api/service-requests/${reference}/cancel`)
      .send({ reason: 'Reported twice.' })
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    const another = await submitServiceRequest(requester);
    await assign(admin, another, officerId);
    await officer
      .post(`/api/service-requests/${another}/cancel`)
      .send({ reason: 'Cannot do it.' })
      .expect(403);
  });

  it.each([
    {},
    { reason: '' },
    { reason: '  ' },
    { reason: 'ab' },
    { reason: 'x'.repeat(1001) },
    { reason: 123 },
  ])('validates reasons before changing history: %j', async (body) => {
    const { requester, reference } = await completedRequest();
    for (const action of ['not-fixed', 'cancel']) {
      const refused = await requester
        .post(`/api/service-requests/${reference}/${action}`)
        .send(body)
        .expect(400);
      expect(refused.body.issues).toEqual([
        expect.objectContaining({ path: ['reason'] }),
      ]);
    }
    expect(
      (await requester.get(`/api/service-requests/${reference}`).expect(200))
        .body.status,
    ).toBe('completed');
  });

  it('resets the seven-day deadline after Not fixed and a new completion', async () => {
    const { reference } = await completedRequest();
    app.clock.advance(6 * DAY);
    const requester = await app.signInByLink('requester@example.com');
    const officer = await app.signInByLink('officer@example.com');
    await requester
      .post(`/api/service-requests/${reference}/not-fixed`)
      .send({ reason: 'Still leaking.' })
      .expect(200);
    await app.runDailyCleanup();
    expect(
      (await requester.get(`/api/service-requests/${reference}`).expect(200))
        .body.status,
    ).toBe('assigned');
    await officer.post(`/api/service-requests/${reference}/start`).expect(200);
    await officer
      .post(`/api/service-requests/${reference}/complete`)
      .expect(200);
    app.clock.advance(DAY);
    await app.runDailyCleanup();
    const fresh = await app.signInByLink('requester@example.com');
    expect(
      (await fresh.get(`/api/service-requests/${reference}`).expect(200)).body
        .status,
    ).toBe('completed');
    app.clock.advance(6 * DAY);
    await app.runDailyCleanup();
    const final = await app.signInByLink('requester@example.com');
    expect(
      (await final.get(`/api/service-requests/${reference}`).expect(200)).body
        .status,
    ).toBe('verified');
  });

  it.each(['deactivate', 'erase'])(
    'automatically verifies when the Requester has left: %s',
    async (action) => {
      const { admin, requesterId, reference } = await completedRequest();
      await admin.post(`/api/users/${requesterId}/${action}`).expect(200);
      app.clock.advance(7 * DAY);
      await app.runDailyCleanup();
      const fresh = await app.signInByLink('admin@example.com');
      expect(
        (await fresh.get(`/api/service-requests/${reference}`).expect(200)).body
          .status,
      ).toBe('verified');
    },
  );

  it('requires completed sign-up and sign-in for every new route, and validates References', async () => {
    const { admin, reference } = await completedRequest();
    const pending = await app.signInByLink('pending@example.com');
    for (const [method, suffix, body] of [
      ['post', '/verify', {}],
      ['post', '/not-fixed', { reason: 'Still leaking.' }],
      ['post', '/cancel', { reason: 'Duplicate report.' }],
      ['patch', '', { location: 'Room 101' }],
      ['put', '/priority', { priority: 'high' }],
    ] as const) {
      await app
        .browser()
        [method](`/api/service-requests/${reference}${suffix}`)
        .send(body)
        .expect(401);
      await pending[method](`/api/service-requests/${reference}${suffix}`)
        .send(body)
        .expect(403);
      await admin[method](`/api/service-requests/invalid${suffix}`)
        .send(body)
        .expect(400);
      await admin[method](`/api/service-requests/SR-PLUMB-999${suffix}`)
        .send(body)
        .expect(404);
    }
  });

  it('lets the Requester verify Completed work, keeping its Assignment and recording one Status Update', async () => {
    const { requester, requesterId, admin, officerId, reference } =
      await completedRequest();
    app.clock.advance(60_000);
    const verified = await requester
      .post(`/api/service-requests/${reference}/verify`)
      .expect(200);
    expect(verified.body).toMatchObject({
      status: 'verified',
      assignment: { officer: { id: officerId } },
    });
    expect(verified.body).not.toHaveProperty('priority');
    expect(verified.body.timeline.at(-1)).toEqual({
      type: 'status_update',
      occurredAt: '2026-11-12T09:01:00.000Z',
      actor: { id: requesterId, name: 'Ada Lovelace' },
      fromStatus: 'completed',
      toStatus: 'verified',
      reason: null,
      note: null,
    });
    const log = await admin.get('/api/activity-log').expect(200);
    expect(
      log.body.filter(
        (entry: { details: { to?: string } }) =>
          entry.details?.to === 'verified',
      ),
    ).toEqual([
      expect.objectContaining({
        actor: { id: requesterId, name: 'Ada Lovelace' },
        serviceRequest: { reference },
        action: 'status_changed',
        details: { from: 'completed', to: 'verified' },
      }),
    ]);
  });

  it('automatically verifies only after seven days, with no actor and no duplicate entry on a second run', async () => {
    const { reference } = await completedRequest();
    app.clock.advance(7 * DAY - 1);
    await app.runDailyCleanup();
    const requester = await app.signInByLink('requester@example.com');
    expect(
      (await requester.get(`/api/service-requests/${reference}`).expect(200))
        .body.status,
    ).toBe('completed');
    app.clock.advance(1);
    await app.runDailyCleanup();
    await app.runDailyCleanup();
    const verified = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(verified.body.status).toBe('verified');
    expect(
      verified.body.timeline.filter(
        (entry: { toStatus?: string }) => entry.toStatus === 'verified',
      ),
    ).toEqual([
      {
        type: 'status_update',
        occurredAt: '2026-11-19T09:00:00.000Z',
        actor: null,
        fromStatus: 'completed',
        toStatus: 'verified',
        reason: null,
        note: null,
      },
    ]);
    const admin = await app.signInByLink('admin@example.com');
    const log = await admin.get('/api/activity-log').expect(200);
    expect(
      log.body.filter(
        (entry: { details?: { to?: string } }) =>
          entry.details?.to === 'verified',
      ),
    ).toEqual([
      expect.objectContaining({
        actor: null,
        target: null,
        serviceRequest: { reference },
        action: 'status_changed',
        details: { from: 'completed', to: 'verified' },
      }),
    ]);
  });

  it('lets the Requester answer Not fixed with a reason, returning work to the same active officer', async () => {
    const { requester, requesterId, officer, officerId, reference } =
      await completedRequest();
    const answered = await requester
      .post(`/api/service-requests/${reference}/not-fixed`)
      .send({ reason: '  The tap is still leaking.  ' })
      .expect(200);
    expect(answered.body).toMatchObject({
      status: 'assigned',
      assignment: { officer: { id: officerId } },
    });
    expect(answered.body.timeline.at(-1)).toMatchObject({
      type: 'status_update',
      actor: { id: requesterId },
      fromStatus: 'completed',
      toStatus: 'assigned',
      reason: 'The tap is still leaking.',
      note: null,
    });
    await officer.post(`/api/service-requests/${reference}/start`).expect(200);
    await officer
      .post(`/api/service-requests/${reference}/complete`)
      .expect(200);
  });

  it.each(['deactivate', 'erase', 'demote'] as const)(
    'returns Not fixed work to Submitted when its officer is removed: %s',
    async (removal) => {
      const { requester, admin, officerId, reference } =
        await completedRequest();
      if (removal === 'demote')
        await admin
          .patch(`/api/users/${officerId}/role`)
          .send({ role: 'staff' })
          .expect(200);
      else await admin.post(`/api/users/${officerId}/${removal}`).expect(200);
      const before = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      const answered = await requester
        .post(`/api/service-requests/${reference}/not-fixed`)
        .send({ reason: 'The tap still leaks.' })
        .expect(200);
      expect(answered.body).toMatchObject({
        status: 'submitted',
        assignment: null,
      });
      expect(answered.body.timeline).toHaveLength(
        before.body.timeline.length + 1,
      );
      expect(answered.body.timeline.at(-1)).toMatchObject({
        type: 'status_update',
        fromStatus: 'completed',
        toStatus: 'submitted',
        reason: 'The tap still leaks.',
      });
      const replacement = await app.signInAsMaintenanceOfficer(
        'replacement@example.com',
      );
      await assign(admin, reference, await idOf(replacement));
      await replacement
        .post(`/api/service-requests/${reference}/start`)
        .expect(200);
    },
  );

  it.each(['submitted', 'assigned', 'in_progress'] as const)(
    'lets an Administrator cancel %s work with a reason and end any current Assignment',
    async (status) => {
      const requester = await app.signUp('requester@example.com');
      const admin = await app.signInAsAdministrator();
      const reference = await submitServiceRequest(requester);
      if (status !== 'submitted') {
        const officer = await app.signInAsMaintenanceOfficer();
        await assign(admin, reference, await idOf(officer));
        if (status === 'in_progress')
          await officer
            .post(`/api/service-requests/${reference}/start`)
            .expect(200);
      }
      const before = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      const cancelled = await admin
        .post(`/api/service-requests/${reference}/cancel`)
        .send({ reason: '  Duplicate report.  ' })
        .expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'cancelled',
        assignment: null,
      });
      expect(cancelled.body.timeline).toHaveLength(
        before.body.timeline.length + 1,
      );
      expect(cancelled.body.timeline.at(-1)).toMatchObject({
        type: 'status_update',
        fromStatus: status,
        toStatus: 'cancelled',
        reason: 'Duplicate report.',
      });
      await admin
        .post(`/api/service-requests/${reference}/cancel`)
        .send({ reason: 'Duplicate report.' })
        .expect(409);
      const log = await admin.get('/api/activity-log').expect(200);
      expect(
        log.body.filter(
          (entry: { details?: { to?: string } }) =>
            entry.details?.to === 'cancelled',
        ),
      ).toHaveLength(1);
    },
  );
});
