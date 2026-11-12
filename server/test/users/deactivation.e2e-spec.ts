import { createTestApp, type TestApp } from '../support/test-app.js';

const PASSWORD = 'Analytical-Engine-1843';

describe('Deactivating a User', () => {
  let app: TestApp;
  let admin: Awaited<ReturnType<TestApp['signInAsAdministrator']>>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await app.reset();
    admin = await app.signInAsAdministrator();
  });
  afterAll(() => app.close());

  const idOf = async (email: string) => {
    const listed = await admin.get('/api/users').expect(200);
    return listed.body.find((user: { email: string }) => user.email === email)
      .id as string;
  };

  const deactivate = async (email: string, expectedStatus = 200) =>
    admin
      .post(`/api/users/${await idOf(email)}/deactivate`)
      .expect(expectedStatus);

  it('signs them out everywhere', async () => {
    const ada = await app.signUp('ada@example.com');

    await deactivate('ada@example.com');

    await ada.get('/api/auth/me').expect(401);
  });

  it('shows them as deactivated in the list of Users', async () => {
    await app.signUp('ada@example.com');

    await deactivate('ada@example.com');

    const listed = await admin.get('/api/users').expect(200);
    expect(listed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'ada@example.com',
          status: 'deactivated',
        }),
      ]),
    );
  });

  it('emails them that the account is deactivated, instead of a Sign-in Link', async () => {
    await app.signUp('ada@example.com');
    await deactivate('ada@example.com');
    app.mailbox.clear();

    await app
      .browser()
      .post('/api/auth/sign-in-link')
      .send({ email: 'ada@example.com' })
      .expect(202);

    const notice = await app.latestMailTo('ada@example.com');
    expect(notice.text).toMatch(/deactivated/i);
    expect(notice.links.some((link) => link.includes('token='))).toBe(false);
  });

  it('tells them the account is deactivated when they give the right password', async () => {
    const ada = await app.signUp('ada@example.com');
    await ada
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);
    await deactivate('ada@example.com');

    const refused = await app
      .browser()
      .post('/api/auth/sign-in')
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(403);

    expect(refused.body).toMatchObject({ error: 'account_deactivated' });
  });

  it('gives a wrong password the usual answer', async () => {
    const ada = await app.signUp('ada@example.com');
    await ada
      .put('/api/auth/password')
      .send({ newPassword: PASSWORD })
      .expect(204);
    await deactivate('ada@example.com');

    await app
      .browser()
      .post('/api/auth/sign-in')
      .send({ email: 'ada@example.com', password: 'Wrong-Password-99' })
      .expect(401);
  });

  it('can be undone, after which they sign in as before', async () => {
    await app.signUp('ada@example.com');
    const id = await idOf('ada@example.com');
    await admin.post(`/api/users/${id}/deactivate`).expect(200);

    await admin.post(`/api/users/${id}/reactivate`).expect(200);

    const ada = await app.signInByLink('ada@example.com');
    await ada.get('/api/auth/me').expect(200);
  });

  it('cannot deactivate the last active Administrator', async () => {
    await deactivate('admin@example.com', 409);
  });
});
