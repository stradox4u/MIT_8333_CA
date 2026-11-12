import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Managing Users', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const userWithEmail = async (
    admin: Awaited<ReturnType<TestApp['signInAsAdministrator']>>,
    email: string,
  ) => {
    const listed = await admin.get('/api/users').expect(200);
    return listed.body.find((user: { email: string }) => user.email === email);
  };

  describe('the list of Users', () => {
    it('shows each User’s Role and status', async () => {
      const admin = await app.signInAsAdministrator('admin@example.com');
      await app.signUp('student@example.com', { role: 'student' });
      await admin
        .post('/api/users')
        .send({
          firstName: 'Katherine',
          lastName: 'Johnson',
          email: 'katherine@example.com',
          role: 'maintenance_officer',
        })
        .expect(201);

      const listed = await admin.get('/api/users').expect(200);

      expect(listed.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: 'admin@example.com',
            role: 'administrator',
            status: 'active',
          }),
          expect.objectContaining({
            email: 'student@example.com',
            role: 'student',
            status: 'active',
          }),
          expect.objectContaining({
            email: 'katherine@example.com',
            role: 'maintenance_officer',
            status: 'invited',
          }),
        ]),
      );
    });

    it('leaves out Pending Sign-ups, who aren’t Users yet', async () => {
      const admin = await app.signInAsAdministrator();
      await app.signInByLink('pending@example.com');

      const listed = await admin.get('/api/users').expect(200);

      expect(listed.body.map((user: { email: string }) => user.email)).toEqual([
        'admin@example.com',
      ]);
    });

    it('is only for Administrators', async () => {
      const student = await app.signUp('student@example.com');

      await student.get('/api/users').expect(403);
    });
  });

  describe('changing a Role', () => {
    it('takes effect on the User’s next request', async () => {
      const admin = await app.signInAsAdministrator();
      const ada = await app.signUp('ada@example.com', { role: 'student' });
      const { id } = await userWithEmail(admin, 'ada@example.com');

      await admin
        .patch(`/api/users/${id}/role`)
        .send({ role: 'maintenance_officer' })
        .expect(200);

      const me = await ada.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ role: 'maintenance_officer' });
    });

    it('cannot demote the last active Administrator', async () => {
      const admin = await app.signInAsAdministrator();
      const { id } = await userWithEmail(admin, 'admin@example.com');

      await admin
        .patch(`/api/users/${id}/role`)
        .send({ role: 'staff' })
        .expect(409);
    });

    it('can demote an Administrator while another remains', async () => {
      const first = await app.signInAsAdministrator('first@example.com');
      await app.signInAsAdministrator('second@example.com');
      const second = await userWithEmail(first, 'second@example.com');

      await first
        .patch(`/api/users/${second.id}/role`)
        .send({ role: 'staff' })
        .expect(200);
    });

    it('does not count an invited Administrator who has never signed in', async () => {
      const admin = await app.signInAsAdministrator();
      await admin
        .post('/api/users')
        .send({
          firstName: 'Typo',
          lastName: 'Admin',
          email: 'adnim@exmaple.com',
          role: 'administrator',
        })
        .expect(201);
      const { id } = await userWithEmail(admin, 'admin@example.com');

      await admin
        .patch(`/api/users/${id}/role`)
        .send({ role: 'staff' })
        .expect(409);
    });

    it('cannot change an Erased User’s Role', async () => {
      const admin = await app.signInAsAdministrator();
      await app.signUp('ada@example.com');
      const { id } = await userWithEmail(admin, 'ada@example.com');
      await admin.post(`/api/users/${id}/erase`).expect(200);

      await admin
        .patch(`/api/users/${id}/role`)
        .send({ role: 'administrator' })
        .expect(409);
    });

    it('answers 404 for an unknown User', async () => {
      const admin = await app.signInAsAdministrator();

      await admin
        .patch('/api/users/00000000-0000-4000-8000-000000000000/role')
        .send({ role: 'staff' })
        .expect(404);
    });
  });
});
