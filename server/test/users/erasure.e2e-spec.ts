import { createTestApp, type TestApp } from '../support/test-app.js';

const PASSWORD = 'Analytical-Engine-1843';
const MINUTE = 60 * 1000;

describe('Erasing a User', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const findListed = async (
    admin: Awaited<ReturnType<TestApp['signInAsAdministrator']>>,
    predicate: (user: Record<string, unknown>) => boolean,
  ) => {
    const listed = await admin.get('/api/users').expect(200);
    return listed.body.find(predicate);
  };

  describe('by an Administrator', () => {
    it('removes their personal details and shows them as an Erased user', async () => {
      const admin = await app.signInAsAdministrator();
      await app.signUp('ada@example.com');
      const ada = await findListed(admin, (u) => u.email === 'ada@example.com');

      await admin.post(`/api/users/${ada.id}/erase`).expect(200);

      const erased = await findListed(admin, (u) => u.id === ada.id);
      expect(erased).toMatchObject({
        name: 'Erased user',
        email: null,
        firstName: null,
        lastName: null,
        role: 'student',
        status: 'erased',
      });
    });

    it('signs them out everywhere', async () => {
      const admin = await app.signInAsAdministrator();
      const adaBrowser = await app.signUp('ada@example.com');
      const ada = await findListed(admin, (u) => u.email === 'ada@example.com');

      await admin.post(`/api/users/${ada.id}/erase`).expect(200);

      await adaBrowser.get('/api/auth/me').expect(401);
    });

    it('removes their password, so it no longer signs in', async () => {
      const admin = await app.signInAsAdministrator();
      const adaBrowser = await app.signUp('ada@example.com');
      await adaBrowser
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(204);
      const ada = await findListed(admin, (u) => u.email === 'ada@example.com');

      await admin.post(`/api/users/${ada.id}/erase`).expect(200);

      await app
        .browser()
        .post('/api/auth/sign-in')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(401);
    });

    it('frees the address to sign up again as a new account', async () => {
      const admin = await app.signInAsAdministrator();
      await app.signUp('ada@example.com');
      const ada = await findListed(admin, (u) => u.email === 'ada@example.com');
      await admin.post(`/api/users/${ada.id}/erase`).expect(200);

      const again = await app.signInByLink('ada@example.com');

      const me = await again.get('/api/auth/me').expect(200);
      expect(me.body.id).not.toBe(ada.id);
      expect(me.body).toMatchObject({ signUpComplete: false });
    });

    it('cannot erase the last active Administrator', async () => {
      const admin = await app.signInAsAdministrator();
      const self = await findListed(
        admin,
        (u) => u.email === 'admin@example.com',
      );

      await admin.post(`/api/users/${self.id}/erase`).expect(409);
    });
  });

  describe('by the User themselves', () => {
    it('erases the account and signs them out', async () => {
      const ada = await app.signUp('ada@example.com');

      await ada.delete('/api/me').expect(204);

      await ada.get('/api/auth/me').expect(401);
    });

    it('needs fresh authentication', async () => {
      const ada = await app.signUp('ada@example.com');
      app.clock.advance(11 * MINUTE);

      const refused = await ada.delete('/api/me').expect(403);

      expect(refused.body).toMatchObject({
        error: 'fresh_authentication_required',
      });
    });

    it('accepts the current password as fresh authentication', async () => {
      const ada = await app.signUp('ada@example.com');
      await ada
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(204);
      app.clock.advance(11 * MINUTE);

      await ada
        .delete('/api/me')
        .send({ currentPassword: PASSWORD })
        .expect(204);
    });

    it('cannot leave the system without an active Administrator', async () => {
      const admin = await app.signInAsAdministrator();

      await admin.delete('/api/me').expect(409);
    });
  });
});
