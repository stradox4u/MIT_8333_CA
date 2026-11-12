import { createTestApp, type TestApp } from '../support/test-app.js';

const PASSWORD = 'Analytical-Engine-1843';

describe('Passwords', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('a User who just signed in by link can set a password and sign in with it', async () => {
    const ada = await app.signUp('ada@example.com');

    await ada
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);

    const laptop = app.browser();
    await laptop
      .post('/api/auth/sign-in')
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(200);
    const me = await laptop.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: 'ada@example.com',
      hasPassword: true,
    });
  });

  it('answers a wrong password exactly as it answers an unknown address', async () => {
    const ada = await app.signUp('ada@example.com');
    await ada
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);

    const wrongPassword = await app
      .browser()
      .post('/api/auth/sign-in')
      .send({ email: 'ada@example.com', password: 'Not-The-Password-1' })
      .expect(401);
    const unknownAddress = await app
      .browser()
      .post('/api/auth/sign-in')
      .send({ email: 'nobody@example.com', password: 'Not-The-Password-1' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownAddress.body);
  });

  it('honours keep-signed-in on password sign-in', async () => {
    const ada = await app.signUp('ada@example.com');
    await ada
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);

    const laptop = app.browser();
    await laptop
      .post('/api/auth/sign-in')
      .send({
        email: 'ada@example.com',
        password: PASSWORD,
        keepSignedIn: true,
      })
      .expect(200);
    app.clock.advance(2 * DAY);

    await laptop.get('/api/auth/me').expect(200);
  });

  it('refuses a Pending Sign-up', async () => {
    const pending = await app.signInByLink('pending@example.com');

    await pending
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(403);
  });

  it('refuses a password that breaks the rules', async () => {
    const ada = await app.signUp('ada@example.com');

    await ada
      .put('/api/auth/password')
      .send({ newPassword: 'too-simple' })
      .expect(400);
  });

  describe('fresh authentication', () => {
    it('is needed more than 10 minutes after signing in', async () => {
      const ada = await app.signUp('ada@example.com');

      app.clock.advance(11 * MINUTE);

      const refused = await ada
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(403);
      expect(refused.body).toMatchObject({
        error: 'fresh_authentication_required',
      });
    });

    it('can be the current password', async () => {
      const ada = await app.signUp('ada@example.com');
      await ada
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(204);

      app.clock.advance(11 * MINUTE);

      await ada
        .put('/api/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: `${PASSWORD}!` })
        .expect(204);
    });

    it('refuses a wrong current password', async () => {
      const ada = await app.signUp('ada@example.com');
      await ada
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(204);

      app.clock.advance(11 * MINUTE);

      await ada
        .put('/api/auth/password')
        .send({
          currentPassword: 'Wrong-Password-99',
          newPassword: `${PASSWORD}!`,
        })
        .expect(403);
    });
  });

  it('setting a password signs the User out everywhere else', async () => {
    const laptop = await app.signUp('ada@example.com');
    const phone = await app.signInByLink('ada@example.com');

    await laptop
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);

    await phone.get('/api/auth/me').expect(401);
    await laptop.get('/api/auth/me').expect(200);
  });

  it('emails the User that a password was set', async () => {
    const ada = await app.signUp('ada@example.com');
    app.mailbox.clear();

    await ada
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);

    const notice = await app.latestMailTo('ada@example.com');
    expect(notice.subject).toMatch(/password/i);
  });
});

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
