import {
  aServiceRequest,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Tracking a Service Request', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  type Browser = Awaited<ReturnType<TestApp['signUp']>>;

  const idOf = async (browser: Browser) => {
    const me = await browser.get('/api/auth/me').expect(200);
    return me.body.id as string;
  };

  it('shows its Requester the details, Submitted, and the timeline', async () => {
    const ada = await app.signUp('ada@example.com', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const reference = await submitServiceRequest(
      ada,
      aServiceRequest({
        title: 'Leaking tap',
        categoryId: 'plumbing',
        location: 'Block C, ground floor toilets',
        description: 'The cold tap drips constantly.',
      }),
    );
    const adaId = await idOf(ada);

    const shown = await ada
      .get(`/api/service-requests/${reference}`)
      .expect(200);

    expect(shown.body).toEqual({
      reference: 'SR-PLUMB-1',
      title: 'Leaking tap',
      category: { id: 'plumbing', name: 'Plumbing', code: 'PLUMB' },
      location: 'Block C, ground floor toilets',
      description: 'The cold tap drips constantly.',
      status: 'submitted',
      requester: { id: adaId, name: 'Ada Lovelace' },
      submittedAt: '2026-11-12T09:00:00.000Z',
      timeline: [
        {
          type: 'status_update',
          occurredAt: '2026-11-12T09:00:00.000Z',
          actor: { id: adaId, name: 'Ada Lovelace' },
          fromStatus: null,
          toStatus: 'submitted',
          reason: null,
        },
      ],
    });
  });

  it('keeps the fields as submitted, without spaces at the ends', async () => {
    const ada = await app.signUp('ada@example.com');
    const reference = await submitServiceRequest(
      ada,
      aServiceRequest({
        title: '  Broken chair ',
        location: ' Room 101 ',
        description: '\nOne leg is snapped off.\n',
      }),
    );

    const shown = await ada
      .get(`/api/service-requests/${reference}`)
      .expect(200);

    expect(shown.body).toMatchObject({
      title: 'Broken chair',
      location: 'Room 101',
      description: 'One leg is snapped off.',
    });
  });

  it.each(['student', 'staff'])(
    'leaves the Priority out for its Requester (%s)',
    async (role) => {
      const requester = await app.signUp('requester@example.com', { role });
      const reference = await submitServiceRequest(requester);

      const shown = await requester
        .get(`/api/service-requests/${reference}`)
        .expect(200);

      expect(shown.body).not.toHaveProperty('priority');
    },
  );

  it('shows it to an Administrator, with its Priority', async () => {
    const ada = await app.signUp('ada@example.com');
    const reference = await submitServiceRequest(ada);
    const admin = await app.signInAsAdministrator();

    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);

    expect(shown.body).toMatchObject({
      reference,
      status: 'submitted',
      priority: 'normal',
    });
  });

  it.each(['student', 'staff'])(
    'answers 404 to another User (%s), as for a Reference nobody has',
    async (role) => {
      const ada = await app.signUp('ada@example.com');
      const reference = await submitServiceRequest(ada);
      const other = await app.signUp('other@example.com', { role });

      const hidden = await other
        .get(`/api/service-requests/${reference}`)
        .expect(404);
      const missing = await other
        .get('/api/service-requests/SR-PLUMB-999')
        .expect(404);

      expect(hidden.body).toEqual(missing.body);
    },
  );

  it('answers 404 to a Maintenance Officer with no Assignment for it, as for a Reference nobody has', async () => {
    const ada = await app.signUp('ada@example.com');
    const reference = await submitServiceRequest(ada);
    const admin = await app.signInAsAdministrator();
    await admin
      .post('/api/users')
      .send({
        firstName: 'Katherine',
        lastName: 'Johnson',
        email: 'katherine@example.com',
        role: 'maintenance_officer',
      })
      .expect(201);
    const officer = await app.signInByLink('katherine@example.com');

    const hidden = await officer
      .get(`/api/service-requests/${reference}`)
      .expect(404);
    const missing = await officer
      .get('/api/service-requests/SR-PLUMB-999')
      .expect(404);

    expect(hidden.body).toEqual(missing.body);
  });

  it('shows an Erased Requester as "Erased user"', async () => {
    const ada = await app.signUp('ada@example.com');
    const reference = await submitServiceRequest(ada);
    const adaId = await idOf(ada);
    const admin = await app.signInAsAdministrator();
    await ada.delete('/api/me').expect(204);

    const shown = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);

    expect(shown.body).toMatchObject({
      requester: { id: adaId, name: 'Erased user' },
      timeline: [{ actor: { id: adaId, name: 'Erased user' } }],
    });
  });

  it('answers 400 for something that isn’t a Reference', async () => {
    const ada = await app.signUp('ada@example.com');

    const refused = await ada
      .get('/api/service-requests/not-a-reference')
      .expect(400);

    expect(refused.body.issues).toEqual([
      { path: [], message: expect.stringContaining('Reference') },
    ]);
  });

  it('refuses a Pending Sign-up', async () => {
    const pending = await app.signInByLink('pending@example.com');

    await pending.get('/api/service-requests/SR-PLUMB-1').expect(403);
  });

  it('needs a signed-in User', async () => {
    await app.browser().get('/api/service-requests/SR-PLUMB-1').expect(401);
  });
});
