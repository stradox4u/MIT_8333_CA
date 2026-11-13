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
        '/api/service-requests/{reference}/assignment',
        '/api/service-requests/{reference}/start',
        '/api/service-requests/{reference}/complete',
        '/api/maintenance-officers',
        '/api/service-requests/{reference}/verify',
        '/api/service-requests/{reference}/not-fixed',
        '/api/service-requests/{reference}/cancel',
        '/api/service-requests/{reference}/priority',
        '/api/service-requests/{reference}/progress-notes',
      ]),
    );
  });

  it('documents the assignment, start and complete routes', () => {
    const assignment =
      document.paths['/api/service-requests/{reference}/assignment'];
    const complete =
      document.paths['/api/service-requests/{reference}/complete'];

    expect(
      assignment.put.requestBody.content['application/json'].schema,
    ).toMatchObject({
      properties: { officerId: expect.anything() },
      required: ['officerId'],
    });
    expect(assignment.put.responses).toHaveProperty('409');
    expect(assignment.delete.responses).toHaveProperty('200');
    expect(
      complete.post.requestBody.content['application/json'].schema,
    ).toMatchObject({ properties: { note: { maxLength: 2000 } } });
    expect(
      document.paths['/api/service-requests/{reference}/start'].post.responses,
    ).toHaveProperty('403');
  });

  it('documents all three kinds of timeline entry', () => {
    const details =
      document.paths['/api/service-requests/{reference}'].get.responses['200']
        .content['application/json'].schema;
    const kinds =
      details.properties.timeline.items.oneOf ??
      details.properties.timeline.items.anyOf;

    expect(
      kinds.map(
        (kind: { properties: { type: { enum: string[] } } }) =>
          kind.properties.type.enum,
      ),
    ).toEqual([['status_update'], ['assignment'], ['progress_note']]);
    expect(kinds[1].properties).toHaveProperty('statusUpdate');
    expect(kinds[1].properties).not.toHaveProperty('statusChange');
  });

  it('documents Progress Note validation and its safe timeline actor', () => {
    const operation =
      document.paths['/api/service-requests/{reference}/progress-notes'].post;
    expect(
      operation.requestBody.content['application/json'].schema,
    ).toMatchObject({
      properties: { text: { minLength: 1, maxLength: 2000 } },
      required: ['text'],
    });
    for (const status of ['201', '400', '403', '404', '409'])
      expect(operation.responses).toHaveProperty(status);
    const timeline =
      document.paths['/api/service-requests/{reference}'].get.responses['200']
        .content['application/json'].schema.properties.timeline.items;
    const note = (timeline.oneOf ?? timeline.anyOf)[2];
    expect(Object.keys(note.properties)).toEqual([
      'type',
      'occurredAt',
      'actor',
      'text',
    ]);
    expect(Object.keys(note.properties.actor.properties)).toEqual([
      'id',
      'name',
    ]);
  });

  it('documents closing actions, strict partial edits and the allowed Priorities', () => {
    for (const action of ['verify', 'not-fixed', 'cancel']) {
      const operation =
        document.paths[`/api/service-requests/{reference}/${action}`].post;
      expect(operation.responses).toHaveProperty('200');
      expect(operation.responses).toHaveProperty('409');
      if (action !== 'verify')
        expect(
          operation.requestBody.content['application/json'].schema,
        ).toMatchObject({
          properties: { reason: { minLength: 3, maxLength: 1000 } },
          required: ['reason'],
        });
    }
    const edit = document.paths['/api/service-requests/{reference}'].patch;
    expect(edit.requestBody.content['application/json'].schema).toMatchObject({
      additionalProperties: false,
      properties: {
        title: { minLength: 3, maxLength: 120 },
        location: { minLength: 2, maxLength: 200 },
        description: { minLength: 10, maxLength: 5000 },
      },
    });
    expect(
      document.paths['/api/service-requests/{reference}/priority'].put
        .requestBody.content['application/json'].schema,
    ).toMatchObject({
      properties: { priority: { enum: ['low', 'normal', 'high', 'urgent'] } },
      required: ['priority'],
    });
  });

  it('describes what the open Status filter means', () => {
    const status = document.paths['/api/service-requests'].get.parameters.find(
      (parameter: { name: string }) => parameter.name === 'status',
    );

    expect(JSON.stringify(status)).toContain(
      'Submitted, Assigned or In Progress',
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
      properties: {
        reference: expect.anything(),
        submittedAt: { type: 'string', format: 'date-time' },
        timeline: expect.anything(),
      },
    });
    expect(tracking.get.responses['404'].description).toMatch(
      /Service Request/,
    );
  });

  it('documents the Priority as present only for some Users', () => {
    const schemaOf = (path: string) =>
      document.paths[path].get.responses['200'].content['application/json']
        .schema;
    const listItem = schemaOf('/api/service-requests').properties.items.items;
    const details = schemaOf('/api/service-requests/{reference}');

    for (const schema of [listItem, details]) {
      expect(schema.properties.priority.description).toBe(
        'Only for Administrators and the request’s current officer; absent for anyone else',
      );
      expect(schema.required).not.toContain('priority');
    }
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
