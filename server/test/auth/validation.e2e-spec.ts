import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Validation errors for client forms', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('adds body field issues while preserving the legacy error shape', async () => {
    const ada = await app.signInByLink('ada@example.com');
    const response = await ada
      .post('/api/auth/sign-up/complete')
      .send({ firstName: '', lastName: ' ', role: 'student' })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: [
        `firstName: ${response.body.issues?.[0]?.message}`,
        `lastName: ${response.body.issues?.[1]?.message}`,
      ],
      issues: [
        { path: ['firstName'], message: expect.any(String) },
        { path: ['lastName'], message: expect.any(String) },
      ],
    });
    const me = await ada.get('/api/auth/me').expect(200);
    expect(me.body.signUpComplete).toBe(false);
  });

  it('keeps scalar parameter issues at the form level', async () => {
    const ada = await app.signInByLink('ada@example.com');
    const response = await ada
      .delete('/api/auth/sessions/not-a-session-id')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['is not a session id'],
      issues: [{ path: [], message: 'is not a session id' }],
    });
  });

  it('keeps ordinary query validation failures as JSON, with relative field paths', async () => {
    const response = await app
      .browser()
      .get('/api/auth/oidc/google/login?keepSignedIn=maybe')
      .expect(400);

    expect(response.headers.location).toBeUndefined();
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: [`keepSignedIn: ${response.body.issues?.[0]?.message}`],
      issues: [{ path: ['keepSignedIn'], message: expect.any(String) }],
    });
  });

  it('does not replace custom fresh-authentication error codes', async () => {
    const ada = await app.signUp('ada@example.com');
    await ada
      .put('/api/auth/password')
      .send({ newPassword: 'Analytical-Engine-1843' })
      .expect(204);
    app.clock.advance(11 * 60 * 1000);

    const stale = await ada
      .put('/api/auth/password')
      .send({ newPassword: 'Analytical-Engine-1843!' })
      .expect(403);
    expect(stale.body.error).toBe('fresh_authentication_required');
    expect(stale.body).not.toHaveProperty('issues');

    const wrong = await ada
      .put('/api/auth/password')
      .send({
        currentPassword: 'wrong',
        newPassword: 'Analytical-Engine-1843!',
      })
      .expect(403);
    expect(wrong.body.error).toBe('wrong_current_password');
    expect(wrong.body).not.toHaveProperty('issues');
  });
});
