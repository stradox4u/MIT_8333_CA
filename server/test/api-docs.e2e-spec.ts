import { createTestApp, type TestApp } from './support/test-app.js';

describe('API documentation', () => {
  let app: TestApp;
  let document: {
    info: { description: string };
    paths: Record<string, Record<string, any>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  beforeAll(async () => {
    app = await createTestApp();
    const response = await app.browser().get('/api/docs-json').expect(200);
    document = response.body;
  });
  afterAll(() => app.close());

  it('serves Swagger UI to anyone, signed in or not', async () => {
    const ui = await app.browser().get('/api/docs').expect(200);

    expect(ui.text).toMatch(/swagger/i);
  });

  it('lists the API’s routes', () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/sign-in-link',
        '/api/auth/me',
        '/api/users',
        '/api/activity-log',
      ]),
    );
  });

  it('documents request bodies from the validation schemas', () => {
    const body =
      document.paths['/api/auth/sign-up/complete'].post.requestBody.content[
        'application/json'
      ].schema;

    expect(body).toMatchObject({
      properties: {
        firstName: expect.anything(),
        lastName: expect.anything(),
        role: { enum: ['student', 'staff'] },
      },
    });
  });

  it('describes the session cookie as how requests are authenticated', () => {
    expect(document.components.securitySchemes).toMatchObject({
      session: { type: 'apiKey', in: 'cookie' },
    });
  });

  it('documents the additive field issues and Google callback failure redirects', () => {
    expect(document.info.description).toContain('issues:');
    expect(
      document.paths['/api/auth/oidc/{provider}/callback'].get.responses['302']
        .description,
    ).toContain('google_sign_in_failed');
  });
});
