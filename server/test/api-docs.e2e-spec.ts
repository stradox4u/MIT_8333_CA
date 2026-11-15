import { createTestApp, type TestApp } from './support/test-app.js';

describe('API documentation', () => {
  let app: TestApp;
  let document: {
    info: { description: string };
    paths: Record<string, Record<string, any>>;
    components: { securitySchemes: Record<string, unknown> };
    security: unknown[];
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
        '/api/service-requests/summary',
        '/api/service-requests/export.csv',
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
        ...[
          'search',
          'category',
          'priority',
          'officerId',
          'submittedFrom',
          'submittedTo',
          'sort',
        ].map((name) => expect.objectContaining({ name, in: 'query' })),
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'pageSize', in: 'query' }),
      ]),
    );
  });

  it('documents the Administrator CSV download, shared filters and ignored pagination', () => {
    const operation = document.paths['/api/service-requests/export.csv'].get;
    expect(operation.responses['200'].content).toEqual({
      'text/csv': { schema: { type: 'string' } },
    });
    expect(operation.responses['200'].description).toContain(
      'pagination is validated but ignored',
    );
    expect(operation.responses['403'].description).toContain('Administrators');
    const scope = operation.parameters.find(
      (parameter: { name: string }) => parameter.name === 'scope',
    );
    expect(scope).toMatchObject({
      required: false,
      schema: { default: 'all', enum: ['all'] },
    });
    expect(
      operation.parameters.map((parameter: { name: string }) => parameter.name),
    ).toEqual([
      'scope',
      'status',
      'search',
      'category',
      'priority',
      'officerId',
      'submittedFrom',
      'submittedTo',
      'sort',
      'page',
      'pageSize',
    ]);
  });

  it('documents summary counts, zero categories and query permissions', () => {
    const operation = document.paths['/api/service-requests/summary'].get;
    const schema =
      operation.responses['200'].content['application/json'].schema;
    expect(schema.properties.byStatus.properties).toHaveProperty('submitted');
    expect(schema.properties.byStatus.required).toEqual([
      'submitted',
      'assigned',
      'in_progress',
      'completed',
      'verified',
      'cancelled',
    ]);
    expect(schema.properties.openByCategory.items.properties).toHaveProperty(
      'count',
    );
    expect(schema.required).not.toContain('openByCategory');
    expect(operation.parameters).toEqual([
      expect.objectContaining({ name: 'scope', required: true }),
    ]);
    for (const status of ['200', '400', '403'])
      expect(operation.responses).toHaveProperty(status);
    const sort = document.paths['/api/service-requests'].get.parameters.find(
      (parameter: { name: string }) => parameter.name === 'sort',
    );
    expect(sort.description).toContain('oldest');
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

  it('describes the identity and session JSON returned to a Pending Sign-up', async () => {
    const identity =
      document.paths['/api/auth/me'].get.responses['200'].content?.[
        'application/json'
      ].schema;
    const sessions =
      document.paths['/api/auth/sessions'].get.responses['200'].content?.[
        'application/json'
      ].schema;

    expect(identity).toMatchObject({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        role: { nullable: true },
        signUpComplete: { type: 'boolean' },
        hasPassword: { type: 'boolean' },
      },
    });
    expect(sessions).toMatchObject({
      type: 'array',
      items: {
        properties: {
          id: { type: 'string' },
          userAgent: { type: 'string', nullable: true },
          signedInAt: { type: 'string', format: 'date-time' },
          lastActiveAt: { type: 'string', format: 'date-time' },
          current: { type: 'boolean' },
        },
      },
    });

    const browser = await app.signInByLink('docs-pending@example.com');
    const me = await browser.get('/api/auth/me').expect(200);
    const listed = await browser.get('/api/auth/sessions').expect(200);
    expect(Object.keys(identity.properties).sort()).toEqual(
      Object.keys(me.body).sort(),
    );
    expect(Object.keys(sessions.items.properties).sort()).toEqual(
      Object.keys(listed.body[0]).sort(),
    );
    expect(me.body.role).toBeNull();
  });

  it('describes managed Users and nullable Activity Log subjects without credentials', async () => {
    const users = document.paths['/api/users'];
    const managed =
      users.post.responses['201'].content?.['application/json'].schema;
    expect(managed).toMatchObject({
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        email: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        role: {
          enum: ['student', 'staff', 'maintenance_officer', 'administrator'],
        },
        status: { enum: ['invited', 'active', 'deactivated', 'erased'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(
      users.get.responses['200'].content['application/json'].schema,
    ).toMatchObject({
      type: 'array',
      items: managed,
    });
    for (const [suffix, method] of [
      ['role', 'patch'],
      ['email', 'patch'],
      ['deactivate', 'post'],
      ['reactivate', 'post'],
      ['erase', 'post'],
    ]) {
      expect(
        document.paths[`/api/users/{id}/${suffix}`][method].responses['200']
          .content['application/json'].schema,
      ).toEqual(managed);
    }

    const log =
      document.paths['/api/activity-log'].get.responses['200'].content?.[
        'application/json'
      ].schema;
    expect(log).toMatchObject({
      type: 'array',
      items: {
        properties: {
          id: { type: 'integer' },
          occurredAt: { type: 'string', format: 'date-time' },
          action: {
            enum: expect.arrayContaining([
              'invited',
              'status_changed',
              'request_deleted',
            ]),
          },
          details: { type: 'object', nullable: true },
          actor: { nullable: true },
          target: { nullable: true },
          serviceRequest: {
            nullable: true,
            properties: { reference: { type: 'string' } },
          },
        },
      },
    });
    const admin = await app.signInAsAdministrator('docs-admin@example.com');
    const invited = await admin
      .post('/api/users')
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'docs-invited@example.com',
        role: 'student',
      })
      .expect(201);
    const erased = await admin
      .post(`/api/users/${invited.body.id}/erase`)
      .expect(200);
    expect(Object.keys(managed.properties).sort()).toEqual(
      Object.keys(erased.body).sort(),
    );
    expect(erased.body.email).toBeNull();
    const activity = await admin.get('/api/activity-log').expect(200);
    expect(Object.keys(log.items.properties).sort()).toEqual(
      Object.keys(activity.body[0]).sort(),
    );
    expect(managed.properties).not.toHaveProperty('passwordHash');
    expect(log.items.properties.actor.properties).not.toHaveProperty('email');
  });

  it('documents public sign-in, cookie-only success responses and Google redirects', () => {
    for (const [path, method] of [
      ['/api/auth/sign-in-link', 'post'],
      ['/api/auth/sign-in-link/consume', 'post'],
      ['/api/auth/sign-in', 'post'],
      ['/api/auth/oidc/{provider}/login', 'get'],
      ['/api/auth/oidc/{provider}/callback', 'get'],
    ]) {
      expect(document.paths[path][method].security).toEqual([]);
    }
    expect(
      document.paths['/api/auth/me'].get.security ?? document.security,
    ).toEqual([{ session: [] }]);
    for (const [path, method, status] of [
      ['/api/auth/sign-in-link', 'post', '202'],
      ['/api/auth/sign-in-link/consume', 'post', '200'],
      ['/api/auth/sign-up/complete', 'post', '200'],
      ['/api/auth/sign-in', 'post', '200'],
      ['/api/auth/password', 'put', '204'],
      ['/api/auth/sign-out', 'post', '204'],
      ['/api/auth/sign-out-everywhere', 'post', '204'],
      ['/api/auth/sessions/{id}', 'delete', '204'],
      ['/api/me', 'delete', '204'],
      ['/api/users/{id}/invitation', 'post', '202'],
    ]) {
      const response = document.paths[path][method].responses[status];
      expect(response.description).toMatch(/no response body/i);
      expect(response).not.toHaveProperty('content');
    }
    for (const action of ['login', 'callback']) {
      const operation =
        document.paths[`/api/auth/oidc/{provider}/${action}`].get;
      expect(operation.responses).not.toHaveProperty('200');
      expect(operation.responses['302'].headers.Location.schema).toEqual({
        type: 'string',
      });
    }
    expect(
      document.paths['/api/auth/oidc/{provider}/callback'].get.parameters,
    ).toEqual(
      expect.arrayContaining(
        ['code', 'state', 'error'].map((name) =>
          expect.objectContaining({
            name,
            in: 'query',
            required: false,
            schema: { type: 'string', maxLength: 4096 },
          }),
        ),
      ),
    );
  });

  it('documents password rules that custom refinements cannot infer', () => {
    const body =
      document.paths['/api/auth/password'].put.requestBody.content[
        'application/json'
      ].schema;
    expect(body).toMatchObject({
      required: ['newPassword'],
      properties: {
        newPassword: {
          type: 'string',
          minLength: 12,
          maxLength: 128,
          writeOnly: true,
        },
        currentPassword: { type: 'string', writeOnly: true },
      },
    });
    expect(body.properties.newPassword.description).toContain('Unicode');
    expect(body.properties.newPassword.description).toContain('uppercase');
  });

  it('describes declared HTTP errors and preserves validation issue paths', async () => {
    for (const path of Object.values(document.paths)) {
      for (const operation of Object.values(path)) {
        for (const [status, response] of Object.entries(
          operation.responses,
        ) as [string, any][]) {
          if (Number(status) < 400) continue;
          expect(
            response.content?.['application/json']?.schema,
            `${operation.operationId} ${status}`,
          ).toMatchObject({
            properties: {
              statusCode: { type: 'integer' },
              message: expect.anything(),
              issues: {
                type: 'array',
                items: {
                  properties: {
                    path: { type: 'array' },
                    message: { type: 'string' },
                  },
                },
              },
            },
            required: expect.arrayContaining(['statusCode', 'message']),
          });
        }
      }
    }
    expect(document.paths['/api/auth/me'].get.responses).toHaveProperty('401');
    expect(document.paths['/api/users'].get.responses).toHaveProperty('403');
    expect(
      document.paths['/api/auth/sign-in-link'].post.responses,
    ).toHaveProperty('429');
    const browser = await app.signInByLink('docs-invalid@example.com');
    const invalid = await browser
      .post('/api/auth/sign-up/complete')
      .send({ firstName: '', lastName: 'Test', role: 'student' })
      .expect(400);
    expect(invalid.body).toMatchObject({
      statusCode: 400,
      issues: expect.arrayContaining([
        { path: ['firstName'], message: expect.any(String) },
      ]),
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
