import { createTestApp, type TestApp } from '../support/test-app.js';

const DEMO = { password: 'Demo-Password-2026', domain: 'demo.test' };

describe('Demo Service Requests', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('emails nobody about the demo history', async () => {
    await app.seedDemoAccounts(DEMO);

    expect(app.mailbox.mails).toEqual([]);
  });

  const signIn = async (role: string) => {
    const browser = app.browser();
    await browser
      .post('/api/auth/sign-in')
      .send({ email: `${role}@${DEMO.domain}`, password: DEMO.password })
      .expect(200);
    return browser;
  };

  it('seeds every Status for Student and Staff, useful officer work, and all requests for the Administrator', async () => {
    await app.seedDemoAccounts(DEMO);
    for (const role of ['student', 'staff']) {
      const browser = await signIn(role);
      const listed = await browser
        .get('/api/service-requests?scope=requested')
        .expect(200);
      expect(listed.body.total).toBe(6);
      expect(
        listed.body.items
          .map((request: { status: string }) => request.status)
          .sort(),
      ).toEqual([
        'assigned',
        'cancelled',
        'completed',
        'in_progress',
        'submitted',
        'verified',
      ]);
    }
    const admin = await signIn('administrator');
    const all = await admin.get('/api/service-requests?scope=all').expect(200);
    expect(all.body.total).toBe(12);
    const officer = await signIn('officer');
    const work = await officer
      .get('/api/service-requests?scope=assigned&status=open')
      .expect(200);
    expect(work.body.total).toBe(4);
    expect(
      work.body.items
        .map((request: { status: string }) => request.status)
        .sort(),
    ).toEqual(['assigned', 'assigned', 'in_progress', 'in_progress']);
    const history = await officer
      .get('/api/service-requests?scope=assigned')
      .expect(200);
    expect(
      history.body.items.map((request: { status: string }) => request.status),
    ).toEqual(expect.arrayContaining(['completed', 'verified', 'cancelled']));
  });

  it('includes realistic Progress Notes in every seeded request timeline', async () => {
    await app.seedDemoAccounts(DEMO);
    const admin = await signIn('administrator');
    const listed = await admin
      .get('/api/service-requests?scope=all')
      .expect(200);
    for (const { reference } of listed.body.items) {
      const shown = await admin
        .get(`/api/service-requests/${reference}`)
        .expect(200);
      expect(shown.body.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'progress_note',
            text: 'The leak is beside the ground-floor sink.',
          }),
        ]),
      );
    }
  });

  it('can be rerun without duplicating or replacing requests and their history', async () => {
    await app.seedDemoAccounts(DEMO);
    const admin = await signIn('administrator');
    const before = await admin
      .get('/api/service-requests?scope=all')
      .expect(200);
    const reference = before.body.items[0].reference;
    const details = await admin
      .get(`/api/service-requests/${reference}`)
      .expect(200);
    await app.seedDemoAccounts(DEMO);
    const after = await admin
      .get('/api/service-requests?scope=all')
      .expect(200);
    expect(after.body).toEqual(before.body);
    expect(
      (await admin.get(`/api/service-requests/${reference}`).expect(200)).body,
    ).toEqual(details.body);
  });
});
