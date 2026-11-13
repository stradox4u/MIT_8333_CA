import { requestInStatus } from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Progress Notes', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('lets the Requester append a trimmed note without changing Status, Activity Log or mail', async () => {
    const { requester, requesterId, admin, reference } = await requestInStatus(
      app,
      'submitted',
    );
    const before = await admin.get('/api/activity-log').expect(200);
    app.mailbox.clear();
    app.clock.advance(60_000);

    const added = await requester
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send({
        text: '  The leak has worsened.\n',
        authorId: 'ignored',
        status: 'verified',
      })
      .expect(201);

    expect(added.body.status).toBe('submitted');
    expect(added.body).not.toHaveProperty('priority');
    expect(added.body.timeline).toEqual([
      expect.objectContaining({ type: 'status_update', toStatus: 'submitted' }),
      {
        type: 'progress_note',
        occurredAt: '2026-11-12T09:01:00.000Z',
        actor: { id: requesterId, name: 'Ada Lovelace' },
        text: 'The leak has worsened.',
      },
    ]);
    expect(
      (await requester.get(`/api/service-requests/${reference}`).expect(200))
        .body,
    ).toEqual(added.body);
    expect((await admin.get('/api/activity-log').expect(200)).body).toEqual(
      before.body,
    );
    expect(app.mailbox.mails).toEqual([]);
  });

  it.each(['submitted', 'assigned', 'in_progress', 'completed'] as const)(
    'lets authorized participants append while %s and preserves tied timeline order',
    async (status) => {
      const { requester, admin, officer, reference } = await requestInStatus(
        app,
        status,
      );
      const authors =
        status === 'submitted'
          ? [requester, admin]
          : [requester, officer, admin];
      for (const [index, author] of authors.entries()) {
        await author
          .post(`/api/service-requests/${reference}/progress-notes`)
          .send({ text: `Note ${index + 1}` })
          .expect(201);
      }
      const shown = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(shown.body.status).toBe(status);
      expect(
        shown.body.timeline
          .slice(-authors.length)
          .map((entry: { text: string }) => entry.text),
      ).toEqual(
        authors.length === 2
          ? ['Note 1', 'Note 2']
          : ['Note 1', 'Note 2', 'Note 3'],
      );
    },
  );

  it.each(['verified', 'cancelled'] as const)(
    'refuses notes after %s without changing history',
    async (status) => {
      const { requester, officer, admin, reference } = await requestInStatus(
        app,
        status,
      );
      const before = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      for (const author of [
        requester,
        admin,
        ...(status === 'verified' ? [officer] : []),
      ]) {
        await author
          .post(`/api/service-requests/${reference}/progress-notes`)
          .send({ text: 'Too late.' })
          .expect(409);
      }
      expect(
        (await requester.get(`/api/service-requests/${reference}`).expect(200))
          .body,
      ).toEqual(before.body);
    },
  );

  it('keeps former officers read-only and hides requests from unrelated Users', async () => {
    const { requester, officer, admin, reference } = await requestInStatus(
      app,
      'assigned',
    );
    const next = await app.signInAsMaintenanceOfficer('next@example.com');
    const nextId = (await next.get('/api/auth/me').expect(200)).body.id;
    await admin
      .put(`/api/service-requests/${reference}/assignment`)
      .send({ officerId: nextId })
      .expect(200);
    await requester
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send({ text: 'Visible to everyone involved.' })
      .expect(201);
    await officer
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send({ text: 'Forbidden.' })
      .expect(403);
    const history = await officer
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(history.body.timeline.at(-1).text).toBe(
      'Visible to everyone involved.',
    );
    for (const other of [
      await app.signUp('other@example.com'),
      await app.signInAsMaintenanceOfficer('unrelated@example.com'),
    ]) {
      const hidden = await other
        .post(`/api/service-requests/${reference}/progress-notes`)
        .send({ text: 'Hidden.' })
        .expect(404);
      const missing = await other
        .post('/api/service-requests/SR-PLUMB-999/progress-notes')
        .send({ text: 'Hidden.' })
        .expect(404);
      expect(hidden.body).toEqual(missing.body);
    }
  });

  it('keeps a former officer who raised the request able to add notes', async () => {
    const officer = await app.signInAsMaintenanceOfficer();
    const admin = await app.signInAsAdministrator();
    const officerId = (await officer.get('/api/auth/me').expect(200)).body.id;
    const submitted = await officer
      .post('/api/service-requests')
      .send({
        title: 'Broken pipe',
        categoryId: 'plumbing',
        location: 'Room 12',
        description: 'The pipe is leaking water.',
      })
      .expect(201);
    const reference = submitted.body.reference;
    await admin
      .put(`/api/service-requests/${reference}/assignment`)
      .send({ officerId })
      .expect(200);
    await admin
      .delete(`/api/service-requests/${reference}/assignment`)
      .expect(200);
    await officer
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send({ text: 'I am still the Requester.' })
      .expect(201);
  });

  it.each([
    {},
    { text: null },
    { text: 42 },
    { text: '' },
    { text: ' \n ' },
    { text: 'x'.repeat(2001) },
  ])('refuses invalid note text %j', async (body) => {
    const { requester, reference } = await requestInStatus(app, 'submitted');
    const refused = await requester
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send(body)
      .expect(400);
    expect(refused.body.issues[0].path).toEqual(['text']);
    const shown = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body.timeline).toHaveLength(1);
  });

  it('accepts both length boundaries after trimming and exposes no edit or delete route', async () => {
    const { requester, reference } = await requestInStatus(app, 'submitted');
    for (const text of [' x ', ` ${'x'.repeat(2000)} `]) {
      await requester
        .post(`/api/service-requests/${reference}/progress-notes`)
        .send({ text })
        .expect(201);
    }
    await requester
      .patch(`/api/service-requests/${reference}/progress-notes/1`)
      .send({ text: 'Replaced' })
      .expect(404);
    await requester
      .delete(`/api/service-requests/${reference}/progress-notes/1`)
      .expect(404);
    const shown = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(
      shown.body.timeline
        .slice(1)
        .map((entry: { text: string }) => entry.text.length),
    ).toEqual([1, 2000]);
  });

  it('interleaves notes with Assignment changes and Status Updates, including after closing', async () => {
    const { requester, admin, officer, officerId, reference } =
      await requestInStatus(app, 'submitted');
    const append = (text: string) =>
      requester
        .post(`/api/service-requests/${reference}/progress-notes`)
        .send({ text })
        .expect(201);
    await append('Before assignment.');
    await admin
      .put(`/api/service-requests/${reference}/assignment`)
      .send({ officerId })
      .expect(200);
    await append('Before work starts.');
    await officer.post(`/api/service-requests/${reference}/start`).expect(200);
    app.clock.advance(60_000);
    await append('While work is in progress.');
    await officer
      .post(`/api/service-requests/${reference}/complete`)
      .expect(200);
    await append('After completion.');
    await requester
      .post(`/api/service-requests/${reference}/verify`)
      .expect(200);
    const shown = await requester
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(
      shown.body.timeline.map(
        (entry: {
          type: string;
          text?: string;
          toStatus?: string;
          change?: string;
        }) => entry.text ?? entry.change ?? entry.toStatus,
      ),
    ).toEqual([
      'submitted',
      'Before assignment.',
      'assigned',
      'Before work starts.',
      'in_progress',
      'While work is in progress.',
      'completed',
      'After completion.',
      'verified',
    ]);
  });

  it('preserves notes with a safe author after erasure', async () => {
    const { requester, requesterId, admin, reference } = await requestInStatus(
      app,
      'submitted',
    );
    await requester
      .post(`/api/service-requests/${reference}/progress-notes`)
      .send({ text: 'The pipe still leaks.' })
      .expect(201);
    await requester.delete('/api/me').expect(204);
    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    expect(shown.body.timeline.at(-1)).toEqual({
      type: 'progress_note',
      occurredAt: '2026-11-12T09:00:00.000Z',
      actor: { id: requesterId, name: 'Erased user' },
      text: 'The pipe still leaks.',
    });
  });

  it('requires a signed-in User and validates the Reference', async () => {
    await app
      .browser()
      .post('/api/service-requests/SR-PLUMB-1/progress-notes')
      .send({ text: 'Hello' })
      .expect(401);
    const pending = await app.signInByLink('pending@example.com');
    await pending
      .post('/api/service-requests/SR-PLUMB-1/progress-notes')
      .send({ text: 'Hello' })
      .expect(403);
    const { requester } = await requestInStatus(app, 'submitted');
    await requester
      .post('/api/service-requests/invalid/progress-notes')
      .send({ text: 'Hello' })
      .expect(400);
  });
});
