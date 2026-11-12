import { createTestApp, type TestApp } from '../support/test-app.js';

const OFFICER = {
  firstName: 'Katherine',
  lastName: 'Johnson',
  email: 'katherine@example.com',
  role: 'maintenance_officer',
};

describe('Invitations', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('emails the invitee a link to the register page with their address filled in', async () => {
    const admin = await app.signInAsAdministrator();

    await admin.post('/api/users').send(OFFICER).expect(201);

    const invitation = await app.latestMailTo(OFFICER.email);
    const link = invitation.link(/register/);
    expect(link.origin + link.pathname).toBe('http://localhost:5173/register');
    expect(link.searchParams.get('email')).toBe(OFFICER.email);
  });

  it('lets the invitee sign in as a User with the name and Role the Administrator gave', async () => {
    const admin = await app.signInAsAdministrator();
    await admin.post('/api/users').send(OFFICER).expect(201);

    const katherine = await app.signInByLink(OFFICER.email);

    const me = await katherine.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      firstName: 'Katherine',
      lastName: 'Johnson',
      role: 'maintenance_officer',
      signUpComplete: true,
    });
  });

  it('can only be sent by an Administrator', async () => {
    const student = await app.signUp('student@example.com');

    await student.post('/api/users').send(OFFICER).expect(403);
  });

  it('refuses an address that already belongs to a User', async () => {
    const admin = await app.signInAsAdministrator();
    await app.signUp(OFFICER.email);

    await admin.post('/api/users').send(OFFICER).expect(409);
  });

  it('refuses an address that already has an Invitation', async () => {
    const admin = await app.signInAsAdministrator();
    await admin.post('/api/users').send(OFFICER).expect(201);

    await admin.post('/api/users').send(OFFICER).expect(409);
  });

  describe('while pending', () => {
    const invite = async () => {
      const admin = await app.signInAsAdministrator();
      const invited = await admin.post('/api/users').send(OFFICER).expect(201);
      return { admin, id: invited.body.id as string };
    };

    it('can be sent again', async () => {
      const { admin, id } = await invite();
      app.mailbox.clear();

      await admin.post(`/api/users/${id}/invitation`).expect(202);

      await app.latestMailTo(OFFICER.email);
    });

    it('can have its address corrected, which sends it to the new address', async () => {
      const { admin, id } = await invite();

      await admin
        .patch(`/api/users/${id}/email`)
        .send({ email: 'kj@example.com' })
        .expect(200);

      await app.latestMailTo('kj@example.com');
      const katherine = await app.signInByLink('kj@example.com');
      const me = await katherine.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ role: 'maintenance_officer' });
    });

    it('cannot take an address that already has an account', async () => {
      const { admin, id } = await invite();
      await app.signUp('taken@example.com');

      await admin
        .patch(`/api/users/${id}/email`)
        .send({ email: 'taken@example.com' })
        .expect(409);
    });
  });

  describe('once the invitee has signed in', () => {
    it('cannot be sent again', async () => {
      const admin = await app.signInAsAdministrator();
      const invited = await admin.post('/api/users').send(OFFICER).expect(201);
      await app.signInByLink(OFFICER.email);

      await admin.post(`/api/users/${invited.body.id}/invitation`).expect(409);
    });

    it('can no longer have its address changed', async () => {
      const admin = await app.signInAsAdministrator();
      const invited = await admin.post('/api/users').send(OFFICER).expect(201);
      await app.signInByLink(OFFICER.email);

      await admin
        .patch(`/api/users/${invited.body.id}/email`)
        .send({ email: 'kj@example.com' })
        .expect(409);
    });
  });

  it('takes over a Pending Sign-up for the same address', async () => {
    const admin = await app.signInAsAdministrator();
    const katherine = await app.signInByLink(OFFICER.email);

    await admin.post('/api/users').send(OFFICER).expect(201);

    const me = await katherine.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      firstName: 'Katherine',
      role: 'maintenance_officer',
      signUpComplete: true,
    });
  });
});
