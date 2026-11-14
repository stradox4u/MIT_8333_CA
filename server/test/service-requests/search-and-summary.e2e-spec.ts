import {
  aServiceRequest,
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import {
  createTestApp,
  type Browser,
  type TestApp,
} from '../support/test-app.js';

const references = (body: { items: { reference: string }[] }) =>
  body.items.map((item) => item.reference);
const list = (
  browser: Browser,
  scope: string,
  query: Record<string, unknown> = {},
) => browser.get('/api/service-requests').query({ scope, ...query });
const summary = (browser: Browser, scope: string) =>
  browser.get('/api/service-requests/summary').query({ scope });

describe('Searching and summarising Service Requests', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('searches Reference or title literally without leaking another Requester’s matches or totals', async () => {
    const ada = await app.signUp('ada@example.com');
    const other = await app.signUp('other@example.com');
    const first = await submitServiceRequest(
      ada,
      aServiceRequest({ title: 'Tap 50%_\\ replacement' }),
    );
    await submitServiceRequest(
      ada,
      aServiceRequest({ title: 'Ordinary tap replacement' }),
    );
    await submitServiceRequest(
      other,
      aServiceRequest({ title: 'Tap 50%_\\ replacement' }),
    );
    const title = await list(ada, 'requested', {
      search: '  TAP 50%_\\  ',
      pageSize: 1,
      page: 2,
    }).expect(200);
    expect(title.body).toEqual({ items: [], page: 2, pageSize: 1, total: 1 });
    const reference = await list(ada, 'requested', {
      search: first.toLowerCase(),
    }).expect(200);
    expect(references(reference.body)).toEqual([first]);
    const injection = await list(ada, 'requested', {
      search: "' OR 1=1 --",
    }).expect(200);
    expect(injection.body).toMatchObject({ items: [], total: 0 });
  });
  it('combines Administrator fields, current officer and inclusive UTC submitted days before paging', async () => {
    let ada = await app.signUp('ada@example.com', {
      firstName: 'Nneka',
      lastName: 'Okafor',
    });
    await app.signInAsAdministrator();
    const former = await app.signInAsMaintenanceOfficer('former@example.com');
    const current = await app.signInAsMaintenanceOfficer('current@example.com');
    const formerId = await idOf(former);
    const currentId = await idOf(current);
    const before = await submitServiceRequest(ada);
    app.clock.advance(15 * 60 * 60 * 1000);
    ada = await app.signInByLink('ada@example.com');
    const midnight = await submitServiceRequest(
      ada,
      aServiceRequest({ location: 'Senate building' }),
    );
    app.clock.advance(24 * 60 * 60 * 1000 - 1);
    ada = await app.signInByLink('ada@example.com');
    const last = await submitServiceRequest(
      ada,
      aServiceRequest({ location: 'Senate building' }),
    );
    app.clock.advance(1);
    await submitServiceRequest(
      ada,
      aServiceRequest({ location: 'Senate building' }),
    );
    const admin = await app.signInByLink('admin@example.com');
    for (const ref of [before, midnight, last]) {
      await assign(admin, ref, formerId);
      await assign(admin, ref, currentId);
      await admin
        .put(`/api/service-requests/${ref}/priority`)
        .send({ priority: 'urgent' })
        .expect(200);
    }
    const query = {
      search: 'nneka okafor',
      status: 'open',
      category: 'plumbing',
      priority: 'urgent',
      officerId: currentId,
      submittedFrom: '2026-11-13',
      submittedTo: '2026-11-13',
      pageSize: 1,
    };
    const page = await list(admin, 'all', query).expect(200);
    expect(page.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(references(page.body)).toEqual([last]);
    const second = await list(admin, 'all', {
      ...query,
      search: 'SENATE',
      page: 2,
    }).expect(200);
    expect(references(second.body)).toEqual([midnight]);
    const formerOnly = await list(admin, 'all', { officerId: formerId }).expect(
      200,
    );
    expect(formerOnly.body).toMatchObject({ items: [], total: 0 });
    for (const [query, total] of [
      [{ submittedTo: '2026-11-13' }, 3],
      [{ submittedFrom: '2026-11-13' }, 3],
      [{ submittedTo: '2026-11-12' }, 1],
      [{ submittedFrom: '2026-11-14' }, 1],
      [{ submittedFrom: '0001-01-01', submittedTo: '9999-12-31' }, 4],
    ] as const)
      expect((await list(admin, 'all', query).expect(200)).body.total).toBe(
        total,
      );
    for (const query of [
      { category: 'electrical' },
      { priority: 'low' },
      { status: 'completed' },
    ]) {
      expect((await list(admin, 'all', query).expect(200)).body.total).toBe(0);
    }
  });

  it('orders Priority Urgent to Low with stable oldest ties, exposing only the officer’s current work for their dashboard', async () => {
    const ada = await app.signUp('ada@example.com');
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const other = await app.signInAsMaintenanceOfficer('other@example.com');
    const officerId = await idOf(officer);
    const otherId = await idOf(other);
    const refs: string[] = [];
    for (const priority of ['low', 'urgent', 'high', 'normal', 'urgent']) {
      app.clock.advance(1000);
      const ref = await submitServiceRequest(ada);
      await assign(admin, ref, officerId);
      await admin
        .put(`/api/service-requests/${ref}/priority`)
        .send({ priority })
        .expect(200);
      refs.push(ref);
    }
    const takenAway = await submitServiceRequest(ada);
    await assign(admin, takenAway, officerId);
    await assign(admin, takenAway, otherId);
    const query = { sort: 'priority', officerId, status: 'open', pageSize: 2 };
    const first = await list(officer, 'assigned', query).expect(200);
    const second = await list(officer, 'assigned', {
      ...query,
      page: 2,
    }).expect(200);
    const third = await list(officer, 'assigned', { ...query, page: 3 }).expect(
      200,
    );
    expect(references(first.body)).toEqual([refs[1], refs[4]]);
    expect(references(second.body)).toEqual([refs[2], refs[3]]);
    expect(references(third.body)).toEqual([refs[0]]);
    expect(first.body.total).toBe(5);
    expect(first.body.items.every((item: object) => 'priority' in item)).toBe(
      true,
    );
    const adminSorted = await list(admin, 'all', {
      sort: 'priority',
      officerId,
    }).expect(200);
    expect(references(adminSorted.body)).toEqual([
      refs[1],
      refs[4],
      refs[2],
      refs[3],
      refs[0],
    ]);
    const history = await list(officer, 'assigned').expect(200);
    expect(history.body.total).toBe(6);
    expect(
      history.body.items.find(
        (item: { reference: string }) => item.reference === takenAway,
      ),
    ).not.toHaveProperty('priority');
    await list(officer, 'assigned', { ...query, officerId: otherId }).expect(
      403,
    );
    await list(officer, 'assigned', { sort: 'priority' }).expect(400);
    await list(ada, 'requested', { officerId }).expect(400);
    await list(ada, 'requested', { sort: 'priority' }).expect(400);
  });

  it('accepts an uppercase own-officer UUID while rejecting another officer’s UUID', async () => {
    const requester = await app.signUp('requester@example.com');
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const other = await app.signInAsMaintenanceOfficer('other@example.com');
    const officerId = await idOf(officer);
    const otherId = await idOf(other);
    const own = await submitServiceRequest(requester);
    const foreign = await submitServiceRequest(requester);
    await assign(admin, own, officerId);
    await assign(admin, foreign, otherId);

    const query = { status: 'open', sort: 'priority' };
    const current = await list(officer, 'assigned', {
      ...query,
      officerId: officerId.toUpperCase(),
    }).expect(200);
    expect(references(current.body)).toEqual([own]);
    expect(current.body.total).toBe(1);
    expect(current.body.items[0]).toHaveProperty('priority', 'normal');
    for (const officerId of [otherId, otherId.toUpperCase()]) {
      await list(officer, 'assigned', { ...query, officerId }).expect(403);
    }
  });

  it('counts every Status within the authorized scope and includes zero Open category counts for Administrators', async () => {
    const ada = await app.signUp('ada@example.com');
    const other = await app.signUp('other@example.com');
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const nextOfficer =
      await app.signInAsMaintenanceOfficer('next@example.com');
    const officerId = await idOf(officer);
    const nextId = await idOf(nextOfficer);
    const empty = {
      submitted: 0,
      assigned: 0,
      in_progress: 0,
      completed: 0,
      verified: 0,
      cancelled: 0,
    };
    expect((await summary(ada, 'requested').expect(200)).body).toEqual({
      byStatus: empty,
    });
    for (const status of [
      'submitted',
      'assigned',
      'in_progress',
      'completed',
      'verified',
      'cancelled',
    ]) {
      const ref = await submitServiceRequest(
        ada,
        aServiceRequest({
          categoryId: status === 'submitted' ? 'electrical' : 'plumbing',
        }),
      );
      if (status !== 'submitted' && status !== 'cancelled') {
        await assign(admin, ref, officerId);
        if (status !== 'assigned')
          await officer.post(`/api/service-requests/${ref}/start`).expect(200);
        if (status === 'completed' || status === 'verified')
          await officer
            .post(`/api/service-requests/${ref}/complete`)
            .expect(200);
        if (status === 'verified')
          await ada.post(`/api/service-requests/${ref}/verify`).expect(200);
        if (status === 'assigned') {
          await assign(admin, ref, nextId);
          await assign(admin, ref, officerId);
          await assign(admin, ref, nextId);
        }
      }
      if (status === 'cancelled')
        await ada
          .post(`/api/service-requests/${ref}/cancel`)
          .send({ reason: 'Duplicate report' })
          .expect(200);
    }
    await submitServiceRequest(other);
    const requested = await summary(ada, 'requested').expect(200);
    expect(requested.body).toEqual({
      byStatus: {
        submitted: 1,
        assigned: 1,
        in_progress: 1,
        completed: 1,
        verified: 1,
        cancelled: 1,
      },
    });
    const held = await summary(officer, 'assigned').expect(200);
    expect(held.body).toEqual({
      byStatus: {
        submitted: 0,
        assigned: 1,
        in_progress: 1,
        completed: 1,
        verified: 1,
        cancelled: 0,
      },
    });
    const all = await summary(admin, 'all').expect(200);
    expect(all.body).toEqual({
      byStatus: {
        submitted: 2,
        assigned: 1,
        in_progress: 1,
        completed: 1,
        verified: 1,
        cancelled: 1,
      },
      openByCategory: [
        {
          category: { id: 'electrical', name: 'Electrical', code: 'ELEC' },
          count: 1,
        },
        {
          category: { id: 'plumbing', name: 'Plumbing', code: 'PLUMB' },
          count: 3,
        },
        {
          category: { id: 'furniture', name: 'Furniture', code: 'FURN' },
          count: 0,
        },
        {
          category: {
            id: 'network',
            name: 'Internet and network',
            code: 'NET',
          },
          count: 0,
        },
        {
          category: {
            id: 'classroom_equipment',
            name: 'Classroom equipment',
            code: 'CLASS',
          },
          count: 0,
        },
        { category: { id: 'other', name: 'Other', code: 'OTHER' }, count: 0 },
      ],
    });
    await submitServiceRequest(admin, aServiceRequest({ categoryId: 'other' }));
    const cancelledOwn = await submitServiceRequest(admin);
    await admin
      .post(`/api/service-requests/${cancelledOwn}/cancel`)
      .send({ reason: 'Duplicate report' })
      .expect(200);
    const own = await summary(admin, 'requested').expect(200);
    expect(own.body.byStatus).toEqual({ ...empty, submitted: 1, cancelled: 1 });
    expect(own.body.openByCategory).toHaveLength(6);
    expect(
      own.body.openByCategory.map((item: { count: number }) => item.count),
    ).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it.each([
    { page: '1e2' },
    { page: '1.0' },
    { page: ['1', '2'] },
    { pageSize: ['2', '3'] },
    { page: '9007199254740991', pageSize: 100 },
    { search: 'x'.repeat(201) },
    { status: ['submitted', 'assigned'] },
    { category: 'unknown' },
    { priority: 'critical' },
    { officerId: 'not-a-uuid' },
    { submittedFrom: '2026-02-29' },
    { submittedFrom: '0000-01-01' },
    { submittedTo: '2026-11-31' },
    { submittedFrom: '2026-11-13T00:00:00Z' },
    { submittedFrom: '2026-11-14', submittedTo: '2026-11-13' },
    { sort: 'oldest' },
    { unexpected: 'value' },
  ])('rejects invalid or ambiguous query %j', async (query) => {
    const admin = await app.signInAsAdministrator();
    const response = await list(admin, 'all', query).expect(400);
    expect(response.body.issues.length).toBeGreaterThan(0);
  });

  it('protects summaries with the same scope permissions and strict query validation', async () => {
    const student = await app.signUp('student@example.com');
    const staff = await app.signUp('staff@example.com', { role: 'staff' });
    const officer = await app.signInAsMaintenanceOfficer();
    const admin = await app.signInAsAdministrator();
    const pending = await app.signInByLink('pending@example.com');
    await summary(app.browser(), 'requested').expect(401);
    await summary(pending, 'requested').expect(403);
    for (const user of [student, staff, officer])
      await summary(user, 'all').expect(403);
    for (const user of [student, staff, admin])
      await summary(user, 'assigned').expect(403);
    await summary(staff, 'requested').expect(200);
    await summary(officer, 'requested').expect(200);
    await student.get('/api/service-requests/summary').expect(400);
    await summary(student, 'unknown').expect(400);
    await student
      .get('/api/service-requests/summary')
      .query({ scope: 'requested', status: 'submitted' })
      .expect(400);
    for (const scope of ['requested', 'assigned']) {
      const user = scope === 'assigned' ? officer : student;
      for (const query of [
        { category: 'plumbing' },
        { priority: 'normal' },
        { submittedFrom: '2026-11-12' },
        { submittedTo: '2026-11-12' },
      ]) {
        await list(user, scope, query).expect(400);
      }
    }
  });

  it('limits assigned search to Reference/title and keeps non-Administrator scopes out of names and locations', async () => {
    const ada = await app.signUp('ada@example.com', {
      firstName: 'Nneka',
      lastName: 'Okafor',
    });
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const ref = await submitServiceRequest(
      ada,
      aServiceRequest({ title: 'Broken sensor', location: 'Senate building' }),
    );
    await submitServiceRequest(
      ada,
      aServiceRequest({ title: 'Broken sensor' }),
    );
    await assign(admin, ref, await idOf(officer));
    expect(
      references(
        (
          await list(officer, 'assigned', {
            search: 'SENSOR',
            status: 'open',
          }).expect(200)
        ).body,
      ),
    ).toEqual([ref]);
    expect(
      references(
        (
          await list(officer, 'assigned', { search: ref.toLowerCase() }).expect(
            200,
          )
        ).body,
      ),
    ).toEqual([ref]);
    for (const [user, scope] of [
      [ada, 'requested'],
      [officer, 'assigned'],
      [admin, 'requested'],
    ] as const) {
      for (const search of ['Senate', 'Nneka'])
        expect(
          (await list(user, scope, { search }).expect(200)).body.total,
        ).toBe(0);
    }
    expect(
      (await list(admin, 'all', { search: '   ' }).expect(200)).body.total,
    ).toBe(2);
  });

  it('searches the retained name of deactivated Requesters and the safe display name of Erased Users', async () => {
    const ada = await app.signUp('ada@example.com', {
      firstName: 'Nneka',
      lastName: 'Okafor',
    });
    const admin = await app.signInAsAdministrator();
    const ref = await submitServiceRequest(ada);
    const adaId = await idOf(ada);
    await admin.post(`/api/users/${adaId}/deactivate`).expect(200);
    expect(
      references(
        (await list(admin, 'all', { search: 'Nneka' }).expect(200)).body,
      ),
    ).toEqual([ref]);
    await admin.post(`/api/users/${adaId}/erase`).expect(200);
    expect(
      (await list(admin, 'all', { search: 'Nneka' }).expect(200)).body.total,
    ).toBe(0);
    const erased = await list(admin, 'all', { search: 'Erased user' }).expect(
      200,
    );
    expect(erased.body.items).toMatchObject([
      { reference: ref, requester: { id: adaId, name: 'Erased user' } },
    ]);
    expect(
      (await summary(admin, 'all').expect(200)).body.byStatus.submitted,
    ).toBe(1);
  });

  it.each(['newest', 'priority'])(
    'keeps equal-time %s pages stable without duplicates',
    async (sort) => {
      const admin = await app.signInAsAdministrator();
      const refs = [];
      for (let index = 0; index < 3; index++)
        refs.push(await submitServiceRequest(admin));
      const first = await list(admin, 'all', { sort, pageSize: 2 }).expect(200);
      const second = await list(admin, 'all', {
        sort,
        pageSize: 2,
        page: 2,
      }).expect(200);
      expect(
        [...references(first.body), ...references(second.body)].sort(),
      ).toEqual(refs.sort());
      const repeat = await list(admin, 'all', { sort, pageSize: 2 }).expect(
        200,
      );
      expect(references(repeat.body)).toEqual(references(first.body));
    },
  );
});
