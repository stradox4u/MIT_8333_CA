import { createTestApp, type TestApp } from '../support/test-app.js';

describe('The Activity Log', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('records each action an Administrator takes on a User, newest first', async () => {
    const admin = await app.signInAsAdministrator();
    const invited = await admin
      .post('/api/users')
      .send({
        firstName: 'Katherine',
        lastName: 'Johnson',
        email: 'katherine@example.com',
        role: 'maintenance_officer',
      })
      .expect(201);
    const id = invited.body.id;
    await admin
      .patch(`/api/users/${id}/role`)
      .send({ role: 'staff' })
      .expect(200);
    await admin.post(`/api/users/${id}/deactivate`).expect(200);
    await admin.post(`/api/users/${id}/reactivate`).expect(200);
    await admin.post(`/api/users/${id}/erase`).expect(200);

    const log = await admin.get('/api/activity-log').expect(200);

    expect(log.body).toMatchObject([
      {
        action: 'erased',
        actor: { name: 'Grace Hopper' },
        target: { id, name: 'Erased user' },
      },
      { action: 'reactivated', target: { id } },
      { action: 'deactivated', target: { id } },
      {
        action: 'role_changed',
        target: { id },
        details: { from: 'maintenance_officer', to: 'staff' },
      },
      {
        action: 'invited',
        target: { id },
        details: { role: 'maintenance_officer' },
      },
    ]);
    expect(log.body[0].occurredAt).toBe('2026-11-12T09:00:00.000Z');
  });

  it('records nothing when an action changes nothing', async () => {
    const admin = await app.signInAsAdministrator();
    await app.signUp('ada@example.com');
    const listed = await admin.get('/api/users').expect(200);
    const { id } = listed.body.find(
      (user: { email: string }) => user.email === 'ada@example.com',
    );

    await admin.post(`/api/users/${id}/reactivate`).expect(200);
    await admin.post(`/api/users/${id}/deactivate`).expect(200);
    await admin.post(`/api/users/${id}/deactivate`).expect(200);
    await admin.post(`/api/users/${id}/erase`).expect(200);
    await admin.post(`/api/users/${id}/erase`).expect(200);

    const log = await admin.get('/api/activity-log').expect(200);
    expect(log.body.map((entry: { action: string }) => entry.action)).toEqual([
      'erased',
      'deactivated',
    ]);
  });

  it('records a User erasing themselves', async () => {
    const admin = await app.signInAsAdministrator();
    const ada = await app.signUp('ada@example.com');
    const me = await ada.get('/api/auth/me').expect(200);

    await ada.delete('/api/me').expect(204);

    const log = await admin.get('/api/activity-log').expect(200);
    expect(log.body).toMatchObject([
      {
        action: 'erased',
        actor: { id: me.body.id, name: 'Erased user' },
        target: { id: me.body.id, name: 'Erased user' },
      },
    ]);
  });

  it('is only for Administrators', async () => {
    const student = await app.signUp('student@example.com');

    await student.get('/api/activity-log').expect(403);
  });
});
