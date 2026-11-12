import { createTestApp, type TestApp } from '../support/test-app.js';
import type { GoogleAccount } from '../support/fake-google.js';

const ADA: GoogleAccount = {
  sub: 'google-ada',
  email: 'ada@example.com',
  givenName: 'Ada',
  familyName: 'Lovelace',
};
const DAY = 24 * 60 * 60 * 1000;

describe('Continue with Google', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const signInWithGoogle = async (
    account: GoogleAccount,
    options?: { keepSignedIn?: boolean },
  ) => {
    const browser = app.browser();
    await app
      .continueWithGoogle(browser, account, options)
      .then((callback) => expect(callback.status).toBe(302));
    return browser;
  };

  it('signs a first-time Google user in as a Pending Sign-up, with their name filled in', async () => {
    const ada = await signInWithGoogle(ADA);

    const me = await ada.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      signUpComplete: false,
    });
  });

  it('signs a returning Google user back in to the same account', async () => {
    const first = await signInWithGoogle(ADA);
    const { body: before } = await first.get('/api/auth/me').expect(200);

    const again = await signInWithGoogle(ADA);

    const { body: after } = await again.get('/api/auth/me').expect(200);
    expect(after.id).toBe(before.id);
  });

  it('recognises the Google account by its id, even after its address changes', async () => {
    const first = await signInWithGoogle(ADA);
    const { body: before } = await first.get('/api/auth/me').expect(200);

    const again = await signInWithGoogle({ ...ADA, email: 'ada@new.example' });

    const { body: after } = await again.get('/api/auth/me').expect(200);
    expect(after.id).toBe(before.id);
  });

  it('signs in to the existing account with the same address', async () => {
    const byLink = await app.signUp('ada@example.com', { role: 'staff' });
    const { body: existing } = await byLink.get('/api/auth/me').expect(200);

    const byGoogle = await signInWithGoogle(ADA);

    const { body: me } = await byGoogle.get('/api/auth/me').expect(200);
    expect(me).toMatchObject({ id: existing.id, role: 'staff' });
  });

  it('signs an invitee in to the account an Administrator created', async () => {
    const admin = await app.signInAsAdministrator();
    await admin
      .post('/api/users')
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        role: 'maintenance_officer',
      })
      .expect(201);

    const ada = await signInWithGoogle(ADA);

    const me = await ada.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      role: 'maintenance_officer',
      signUpComplete: true,
    });
  });

  it('refuses an address Google hasn’t verified', async () => {
    const browser = app.browser();

    const callback = await app.continueWithGoogle(browser, {
      ...ADA,
      emailVerified: false,
    });

    expect(callback.status).toBe(403);
    await browser.get('/api/auth/me').expect(401);
  });

  it('tells a deactivated User their account is deactivated', async () => {
    const admin = await app.signInAsAdministrator();
    await app.signUp('ada@example.com');
    const listed = await admin.get('/api/users').expect(200);
    const ada = listed.body.find(
      (user: { email: string }) => user.email === 'ada@example.com',
    );
    await admin.post(`/api/users/${ada.id}/deactivate`).expect(200);

    const callback = await app.continueWithGoogle(app.browser(), ADA);

    expect(callback.status).toBe(403);
    expect(callback.body).toMatchObject({ error: 'account_deactivated' });
  });

  it('refuses a sign-in provider other than Google', async () => {
    await app.browser().get('/api/auth/oidc/github/login').expect(400);
  });

  it('refuses a keep-signed-in value that is neither true nor false', async () => {
    await app
      .browser()
      .get('/api/auth/oidc/google/login?keepSignedIn=maybe')
      .expect(400);
  });

  it('treats an empty keep-signed-in as no', async () => {
    await app
      .browser()
      .get('/api/auth/oidc/google/login?keepSignedIn=')
      .expect(302);
  });

  it('honours keep-signed-in', async () => {
    const ada = await signInWithGoogle(ADA, { keepSignedIn: true });

    app.clock.advance(2 * DAY);

    await ada.get('/api/auth/me').expect(200);
  });

  it('forgets the Google account when the User is erased', async () => {
    const first = await signInWithGoogle(ADA);
    await first
      .post('/api/auth/sign-up/complete')
      .send({ firstName: 'Ada', lastName: 'Lovelace', role: 'student' })
      .expect(200);
    const { body: erased } = await first.get('/api/auth/me').expect(200);
    await first.delete('/api/me').expect(204);

    const again = await signInWithGoogle(ADA);

    const { body: me } = await again.get('/api/auth/me').expect(200);
    expect(me.id).not.toBe(erased.id);
    expect(me).toMatchObject({ signUpComplete: false });
  });
});
