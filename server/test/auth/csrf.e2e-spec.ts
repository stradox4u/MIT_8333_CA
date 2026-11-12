import { createTestApp, type TestApp } from '../support/test-app.js';

/** In tests, the client app's origin (`APP_URL`). */
const CLIENT_ORIGIN = 'http://localhost:5173';
/** Netlify forwards requests to the API with the API's own host (ADR-0005). */
const API_HOST = 'mit8333-api.up.railway.app';

describe('Cross-site request forgery protection', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('refuses a write sent from another site’s page', async () => {
    const ada = await app.signUp('ada@example.com');

    await ada
      .post('/api/auth/sign-out')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Origin', 'https://evil.example')
      .expect(403);

    await ada.get('/api/auth/me').expect(200);
  });

  it('accepts writes from the client app, which reach the API through Netlify', async () => {
    const ada = await app.signUp('ada@example.com');

    await ada
      .post('/api/auth/sign-out')
      .set('Host', API_HOST)
      .set('Origin', CLIENT_ORIGIN)
      .expect(204);

    await ada.get('/api/auth/me').expect(401);
  });

  it('refuses a write from any other origin behind the same proxy', async () => {
    const ada = await app.signUp('ada@example.com');

    await ada
      .post('/api/auth/sign-out')
      .set('Host', API_HOST)
      .set('Origin', 'https://evil.example')
      .expect(403);

    await ada.get('/api/auth/me').expect(200);
  });
});
