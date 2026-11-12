import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Finishing sign-up', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('turns a Pending Sign-up into a User with the name and Role they give', async () => {
    const ada = await app.signInByLink('ada@example.com');

    await ada
      .post('/api/auth/sign-up/complete')
      .send({ firstName: 'Ada', lastName: 'Lovelace', role: 'student' })
      .expect(200);

    const me = await ada.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'student',
      signUpComplete: true,
    });
  });

  it('can only happen once, so a User cannot switch their own Role later', async () => {
    const ada = await app.signInByLink('ada@example.com');
    await ada
      .post('/api/auth/sign-up/complete')
      .send({ firstName: 'Ada', lastName: 'Lovelace', role: 'student' })
      .expect(200);

    await ada
      .post('/api/auth/sign-up/complete')
      .send({ firstName: 'Ada', lastName: 'Lovelace', role: 'staff' })
      .expect(409);

    const me = await ada.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ role: 'student' });
  });

  it.each(['maintenance_officer', 'administrator'])(
    'refuses %s, which only an Administrator can grant',
    async (role) => {
      const mallory = await app.signInByLink('mallory@example.com');

      await mallory
        .post('/api/auth/sign-up/complete')
        .send({ firstName: 'Mallory', lastName: 'Jones', role })
        .expect(400);

      const me = await mallory.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ role: null, signUpComplete: false });
    },
  );
});
