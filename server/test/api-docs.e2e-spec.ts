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
        '/api/request-categories',
        '/api/service-requests',
        '/api/service-requests/{reference}',
      ]),
    );
  });

  it('documents the Service Request form from its validation schema', () => {
    const body =
      document.paths['/api/service-requests'].post.requestBody.content[
        'application/json'
      ].schema;

    expect(body).toMatchObject({
      properties: {
        title: { minLength: 3, maxLength: 120 },
        categoryId: expect.anything(),
        location: { minLength: 2, maxLength: 200 },
        description: { minLength: 10, maxLength: 5000 },
      },
      required: ['title', 'categoryId', 'location', 'description'],
    });
  });

  it('documents the Service Request list’s query parameters', () => {
    const parameters = document.paths['/api/service-requests'].get.parameters;

    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'scope', in: 'query', required: true }),
        expect.objectContaining({ name: 'status', in: 'query' }),
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'pageSize', in: 'query' }),
      ]),
    );
  });

  it('documents what the Service Request routes answer', () => {
    const service = document.paths['/api/service-requests'];
    const tracking = document.paths['/api/service-requests/{reference}'];
    const schemaOf = (operation: any, status: string) =>
      operation.responses[status].content['application/json'].schema;

    expect(schemaOf(service.post, '201')).toMatchObject({
      properties: { reference: expect.anything() },
    });
    expect(schemaOf(service.get, '200')).toMatchObject({
      properties: {
        items: expect.anything(),
        page: expect.anything(),
        pageSize: expect.anything(),
        total: expect.anything(),
      },
    });
    expect(schemaOf(tracking.get, '200')).toMatchObject({
      properties: { reference: expect.anything(), timeline: expect.anything() },
    });
    expect(tracking.get.responses['404'].description).toMatch(
      /Service Request/,
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
