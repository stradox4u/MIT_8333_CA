import { createTestApp, type TestApp } from '../support/test-app.js';

const DEMO = { password: 'Demo-Password-2026', domain: 'demo.test' };

describe('Demo accounts', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it.each([
    ['administrator@demo.test', 'administrator'],
    ['officer@demo.test', 'maintenance_officer'],
    ['student@demo.test', 'student'],
    ['staff@demo.test', 'staff'],
  ])(
    'lets a marker sign in as %s with the demo password',
    async (email, role) => {
      await app.seedDemoAccounts(DEMO);
      const marker = app.browser();

      await marker
        .post('/api/auth/sign-in')
        .send({ email, password: DEMO.password })
        .expect(200);

      const me = await marker.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ role, signUpComplete: true });
    },
  );

  it('can be run again without creating duplicates', async () => {
    await app.seedDemoAccounts(DEMO);
    await app.seedDemoAccounts(DEMO);
    const admin = app.browser();
    await admin
      .post('/api/auth/sign-in')
      .send({
        email: 'administrator@demo.test',
        password: DEMO.password,
      })
      .expect(200);

    const listed = await admin.get('/api/users').expect(200);

    expect(listed.body).toHaveLength(4);
    expect(
      listed.body.every((user: { status: string }) => user.status === 'active'),
    ).toBe(true);
  });

  it('refuses a demo password that breaks the password rules', async () => {
    await expect(
      app.seedDemoAccounts({ ...DEMO, password: 'demo' }),
    ).rejects.toThrow(/DEMO_ACCOUNTS_PASSWORD/);
  });
});
