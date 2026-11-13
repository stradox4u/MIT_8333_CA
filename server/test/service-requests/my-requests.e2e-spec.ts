import { aServiceRequest } from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const MINUTE = 60 * 1000;

describe('Listing the Service Requests a User raised', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  type Browser = Awaited<ReturnType<TestApp['signUp']>>;

  const submit = async (browser: Browser, body = aServiceRequest()) => {
    const submitted = await browser
      .post('/api/service-requests')
      .send(body)
      .expect(201);
    return submitted.body.reference as string;
  };

  const list = (browser: Browser, query: Record<string, unknown> = {}) =>
    browser
      .get('/api/service-requests')
      .query({ scope: 'requested', ...query });

  it('lists only theirs, newest first, as a page', async () => {
    const ada = await app.signUp('ada@example.com', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const grace = await app.signUp('grace@example.com');
    await submit(ada, aServiceRequest({ categoryId: 'plumbing' }));
    app.clock.advance(MINUTE);
    await submit(grace, aServiceRequest({ categoryId: 'plumbing' }));
    app.clock.advance(MINUTE);
    await submit(
      ada,
      aServiceRequest({
        title: 'Projector won’t turn on',
        categoryId: 'classroom_equipment',
        location: 'Lecture theatre 2',
      }),
    );
    const me = await ada.get('/api/auth/me').expect(200);

    const listed = await list(ada).expect(200);

    expect(listed.body).toEqual({
      items: [
        {
          reference: 'SR-CLASS-1',
          title: 'Projector won’t turn on',
          category: {
            id: 'classroom_equipment',
            name: 'Classroom equipment',
            code: 'CLASS',
          },
          location: 'Lecture theatre 2',
          status: 'submitted',
          requester: { id: me.body.id, name: 'Ada Lovelace' },
          submittedAt: '2026-11-12T09:02:00.000Z',
        },
        expect.objectContaining({
          reference: 'SR-PLUMB-1',
          submittedAt: '2026-11-12T09:00:00.000Z',
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it.each(['student', 'staff'])(
    'leaves the Priority out for a Requester (%s)',
    async (role) => {
      const requester = await app.signUp('requester@example.com', { role });
      await submit(requester);

      const listed = await list(requester).expect(200);

      expect(listed.body.items).toHaveLength(1);
      expect(listed.body.items[0]).not.toHaveProperty('priority');
    },
  );

  it('shows an Administrator the Priority of the requests they raised', async () => {
    const admin = await app.signInAsAdministrator();
    await submit(admin);

    const listed = await list(admin).expect(200);

    expect(listed.body.items).toMatchObject([{ priority: 'normal' }]);
  });

  it('pages them, 20 to a page unless asked otherwise', async () => {
    const ada = await app.signUp('ada@example.com');
    const submitted: string[] = [];
    for (let i = 0; i < 23; i++) {
      submitted.push(await submit(ada));
    }

    const first = await list(ada).expect(200);
    const second = await list(ada, { page: 2 }).expect(200);

    expect(first.body).toMatchObject({ page: 1, pageSize: 20, total: 23 });
    expect(first.body.items).toHaveLength(20);
    expect(second.body).toMatchObject({ page: 2, pageSize: 20, total: 23 });
    expect(second.body.items).toHaveLength(3);
    const references = [...first.body.items, ...second.body.items].map(
      (item: { reference: string }) => item.reference,
    );
    expect(references.sort()).toEqual(submitted.sort());
  });

  it('takes a page size, and answers an empty page past the end', async () => {
    const ada = await app.signUp('ada@example.com');
    for (let i = 0; i < 3; i++) {
      await submit(ada);
    }

    const second = await list(ada, { page: 2, pageSize: 2 }).expect(200);
    const past = await list(ada, { page: 3, pageSize: 2 }).expect(200);

    expect(second.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(second.body.items).toHaveLength(1);
    expect(past.body).toEqual({ items: [], page: 3, pageSize: 2, total: 3 });
  });

  it('filters by Status', async () => {
    const ada = await app.signUp('ada@example.com');
    await submit(ada);

    const submitted = await list(ada, { status: 'submitted' }).expect(200);
    const completed = await list(ada, { status: 'completed' }).expect(200);

    expect(submitted.body.total).toBe(1);
    expect(completed.body).toMatchObject({ items: [], total: 0 });
  });

  // Slice 1 can only make Submitted requests, so this can't yet show `open`
  // leaving out Completed, Verified and Cancelled ones; later slices can.
  it('filters by Open: Submitted, Assigned or In Progress', async () => {
    const ada = await app.signUp('ada@example.com');
    const reference = await submit(ada);

    const open = await list(ada, { status: 'open' }).expect(200);

    expect(open.body).toMatchObject({ items: [{ reference }], total: 1 });
  });

  it.each([
    ['pageSize', 'over 100', { pageSize: 101 }],
    ['pageSize', 'of 0', { pageSize: 0 }],
    ['page', 'of 0', { page: 0 }],
    ['page', 'that isn’t a number', { page: 'two' }],
    ['status', 'that doesn’t exist', { status: 'resolved' }],
  ])('refuses a %s %s', async (field, _why, query) => {
    const ada = await app.signUp('ada@example.com');

    const refused = await list(ada, query).expect(400);

    expect(refused.body.issues).toEqual([
      { path: [field], message: expect.any(String) },
    ]);
  });

  it.each(['assigned', 'all'])(
    'refuses the %s scope with a clear 400, for now',
    async (scope) => {
      const admin = await app.signInAsAdministrator();

      const refused = await list(admin, { scope }).expect(400);

      expect(refused.body.issues).toEqual([
        { path: ['scope'], message: expect.stringContaining('requested') },
      ]);
    },
  );

  it('needs a scope', async () => {
    const ada = await app.signUp('ada@example.com');

    const refused = await ada.get('/api/service-requests').expect(400);

    expect(refused.body.issues).toEqual([
      { path: ['scope'], message: expect.any(String) },
    ]);
  });

  it('refuses a Pending Sign-up', async () => {
    const pending = await app.signInByLink('pending@example.com');

    await list(pending).expect(403);
  });
});
