import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Sessions', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('signing out ends only this browser’s session', async () => {
    const laptop = await app.signInByLink('ada@example.com');
    const phone = await app.signInByLink('ada@example.com');

    await laptop.post('/api/auth/sign-out').expect(204);

    await laptop.get('/api/auth/me').expect(401);
    await phone.get('/api/auth/me').expect(200);
  });

  it('signing out everywhere ends every session of the User', async () => {
    const laptop = await app.signInByLink('ada@example.com');
    const phone = await app.signInByLink('ada@example.com');

    await laptop.post('/api/auth/sign-out-everywhere').expect(204);

    await laptop.get('/api/auth/me').expect(401);
    await phone.get('/api/auth/me').expect(401);
  });

  it('lists the User’s sessions with the browser each came from', async () => {
    const laptop = await app.signInByLink('ada@example.com', {
      userAgent: 'Firefox on Linux',
    });
    await app.signInByLink('ada@example.com', {
      userAgent: 'Safari on iPhone',
    });

    const listed = await laptop.get('/api/auth/sessions').expect(200);

    expect(listed.body).toHaveLength(2);
    expect(listed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userAgent: 'Firefox on Linux',
          current: true,
        }),
        expect.objectContaining({
          userAgent: 'Safari on iPhone',
          current: false,
        }),
      ]),
    );
  });

  it('revoking a session signs that browser out', async () => {
    const laptop = await app.signInByLink('ada@example.com');
    const phone = await app.signInByLink('ada@example.com');
    const listed = await laptop.get('/api/auth/sessions').expect(200);
    const phoneSession = listed.body.find(
      (session: { current: boolean }) => !session.current,
    );

    await laptop.delete(`/api/auth/sessions/${phoneSession.id}`).expect(204);

    await phone.get('/api/auth/me').expect(401);
    await laptop.get('/api/auth/me').expect(200);
  });

  it('cannot revoke another User’s session', async () => {
    const ada = await app.signInByLink('ada@example.com');
    const grace = await app.signInByLink('grace@example.com');
    const listed = await grace.get('/api/auth/sessions').expect(200);

    await ada.delete(`/api/auth/sessions/${listed.body[0].id}`).expect(404);

    await grace.get('/api/auth/me').expect(200);
  });

  it('answers a malformed session id with 400', async () => {
    const ada = await app.signInByLink('ada@example.com');

    await ada.delete('/api/auth/sessions/not-a-session-id').expect(400);
  });

  describe('without keep-signed-in', () => {
    it('stays signed in while used at least hourly', async () => {
      const ada = await app.signInByLink('ada@example.com');

      for (let visit = 0; visit < 5; visit++) {
        app.clock.advance(59 * MINUTE);
        await ada.get('/api/auth/me').expect(200);
      }
    });

    it('is signed out after an hour unused', async () => {
      const ada = await app.signInByLink('ada@example.com');

      app.clock.advance(HOUR);

      await ada.get('/api/auth/me').expect(401);
    });

    it('no longer lists a session left unused for an hour', async () => {
      const laptop = await app.signInByLink('ada@example.com', {
        keepSignedIn: true,
      });
      await app.signInByLink('ada@example.com');

      app.clock.advance(HOUR);

      const listed = await laptop.get('/api/auth/sessions').expect(200);
      expect(listed.body).toHaveLength(1);
    });
  });

  describe('with keep-signed-in', () => {
    it('stays signed in after two days unused', async () => {
      const ada = await app.signInByLink('ada@example.com', {
        keepSignedIn: true,
      });

      app.clock.advance(2 * DAY);

      await ada.get('/api/auth/me').expect(200);
    });

    it('is signed out after three days unused', async () => {
      const ada = await app.signInByLink('ada@example.com', {
        keepSignedIn: true,
      });

      app.clock.advance(3 * DAY);

      await ada.get('/api/auth/me').expect(401);
    });

    it('never expires while used every two days', async () => {
      const ada = await app.signInByLink('ada@example.com', {
        keepSignedIn: true,
      });

      for (let visit = 0; visit < 30; visit++) {
        app.clock.advance(2 * DAY);
        await ada.get('/api/auth/me').expect(200);
      }
    });

    it('applies only in the browser that asked for it', async () => {
      const laptop = app.browser();
      await laptop
        .post('/api/auth/sign-in-link')
        .send({ email: 'ada@example.com', keepSignedIn: true })
        .expect(202);
      const token = await app.signInLinkTokenSentTo('ada@example.com');
      const phone = app.browser();
      await phone
        .post('/api/auth/sign-in-link/consume')
        .send({ token })
        .expect(200);

      app.clock.advance(HOUR);

      await phone.get('/api/auth/me').expect(401);
    });
  });
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
