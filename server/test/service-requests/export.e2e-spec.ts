import {
  aServiceRequest,
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const endpoint = '/api/service-requests/export.csv';
const header =
  'Reference,title,Request Category,location,Priority,Status,Requester,current officer,Submitted,Completed,Verified\r\n';

describe('Exporting Service Requests', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('downloads every matching request as a named UTF-8 CSV with only the report columns', async () => {
    const requester = await app.signUp('requester@example.com');
    const admin = await app.signInAsAdministrator();
    const reference = await submitServiceRequest(
      requester,
      aServiceRequest({ location: 'Block C' }),
    );
    const exported = await admin.get(endpoint).expect(200);
    expect(exported.headers['content-type']).toMatch(
      /^text\/csv; charset=utf-8$/i,
    );
    expect(exported.headers['content-disposition']).toBe(
      'attachment; filename="service-requests.csv"',
    );
    expect(exported.headers['cache-control']).toBe('no-store');
    expect(exported.text).toBe(
      header +
        `${reference},Leaking tap,Plumbing,Block C,Normal,Submitted,Ada Lovelace,,2026-11-12T09:00:00.000Z,,\r\n`,
    );
  });
  it('escapes Unicode, commas, quotes and line breaks and protects spreadsheet formula text', async () => {
    const requester = await app.signUp('requester@example.com', {
      firstName: '=Ada',
      lastName: 'Ökafor',
    });
    const admin = await app.signInAsAdministrator();
    const reference = await submitServiceRequest(
      requester,
      aServiceRequest({
        title: '=HYPERLINK("https://example.com"), réparer\nnow',
        location: '@SUM(1,2)',
      }),
    );
    const exported = await admin.get(endpoint).expect(200);
    expect(exported.text).toBe(
      header +
        `${reference},"'=HYPERLINK(""https://example.com""), réparer\nnow",Plumbing,"'@SUM(1,2)",Normal,Submitted,'=Ada Ökafor,,2026-11-12T09:00:00.000Z,,\r\n`,
    );
  });

  it('includes all rows beyond the list page limit and keeps the list’s stable ordering', async () => {
    const admin = await app.signInAsAdministrator();
    const submitted = [];
    for (let index = 0; index < 103; index++)
      submitted.push(
        await submitServiceRequest(
          admin,
          aServiceRequest({ location: 'Library' }),
        ),
      );
    for (const sort of ['newest', 'priority']) {
      const first = await admin
        .get('/api/service-requests')
        .query({ scope: 'all', sort, pageSize: 100 })
        .expect(200);
      const second = await admin
        .get('/api/service-requests')
        .query({ scope: 'all', sort, pageSize: 100, page: 2 })
        .expect(200);
      const exported = await admin
        .get(endpoint)
        .query({ scope: 'all', sort, pageSize: 1, page: 200 })
        .expect(200);
      const refs = exported.text
        .split('\r\n')
        .slice(1, -1)
        .map((row: string) => row.split(',')[0]);
      expect(refs).toEqual(
        [...first.body.items, ...second.body.items].map(
          (row: { reference: string }) => row.reference,
        ),
      );
      expect(refs).toHaveLength(103);
      expect([...refs].sort()).toEqual([...submitted].sort());
    }
  });

  it('requires a signed-in Administrator, including for an empty export', async () => {
    await app.browser().get(endpoint).expect(401);
    const pending = await app.signInByLink('pending@example.com');
    await pending.get(endpoint).expect(403);
    const student = await app.signUp('student@example.com');
    const staff = await app.signUp('staff@example.com', { role: 'staff' });
    const officer = await app.signInAsMaintenanceOfficer();
    for (const user of [student, staff, officer])
      await user.get(endpoint).expect(403);
    const admin = await app.signInAsAdministrator();
    expect((await admin.get(endpoint).expect(200)).text).toBe(header);
  });

  it.each([
    { scope: 'requested' },
    { scope: 'assigned' },
    { scope: ['all', 'all'] },
    { page: '0' },
    { page: ['1', '2'] },
    { pageSize: '101' },
    { pageSize: ['1', '2'] },
    { page: '9007199254740991', pageSize: 100 },
    { search: 'x'.repeat(201) },
    { status: ['open', 'submitted'] },
    { status: 'closed' },
    { category: 'unknown' },
    { priority: 'critical' },
    { officerId: 'invalid' },
    { officerId: ['bad', 'bad'] },
    { submittedFrom: '2026-02-29' },
    { submittedTo: '0000-01-01' },
    { submittedFrom: '2026-11-14', submittedTo: '2026-11-13' },
    { sort: 'oldest' },
    { unexpected: 'value' },
  ])('rejects invalid or ambiguous export query %j', async (query) => {
    const admin = await app.signInAsAdministrator();
    await admin.get(endpoint).query(query).expect(400);
  });

  it('combines current officer, Open, category, Priority, literal search and inclusive UTC days like the JSON list', async () => {
    let requester = await app.signUp('requester@example.com', {
      firstName: 'Nneka',
      lastName: 'Okafor',
    });
    await app.signInAsAdministrator();
    const former = await app.signInAsMaintenanceOfficer('former@example.com');
    const current = await app.signInAsMaintenanceOfficer('current@example.com');
    const formerId = await idOf(former);
    const currentId = await idOf(current);
    const before = await submitServiceRequest(requester);
    app.clock.advance(15 * 60 * 60 * 1000);
    requester = await app.signInByLink('requester@example.com');
    const midnight = await submitServiceRequest(
      requester,
      aServiceRequest({ location: 'Senate 50%_\\ building' }),
    );
    app.clock.advance(24 * 60 * 60 * 1000 - 1);
    requester = await app.signInByLink('requester@example.com');
    const last = await submitServiceRequest(
      requester,
      aServiceRequest({ location: 'Senate 50%_\\ building' }),
    );
    app.clock.advance(1);
    const after = await submitServiceRequest(requester);
    const admin = await app.signInByLink('admin@example.com');
    for (const ref of [before, midnight, last, after]) {
      await assign(admin, ref, formerId);
      await assign(admin, ref, currentId);
      await admin
        .put(`/api/service-requests/${ref}/priority`)
        .send({ priority: 'urgent' })
        .expect(200);
    }
    const query = {
      scope: 'all',
      search: '  nneka OKAFOR  ',
      status: 'open',
      category: 'plumbing',
      priority: 'urgent',
      officerId: currentId.toUpperCase(),
      submittedFrom: '2026-11-13',
      submittedTo: '2026-11-13',
      sort: 'priority',
    };
    const matchingRefs = async (filters: object) => {
      const json = await admin
        .get('/api/service-requests')
        .query(filters)
        .expect(200);
      const csv = await admin
        .get(endpoint)
        .query({ ...filters, page: 5, pageSize: 1 })
        .expect(200);
      const refs = csv.text
        .split('\r\n')
        .slice(1, -1)
        .map((row: string) => row.split(',')[0]);
      expect(refs).toEqual(
        json.body.items.map((row: { reference: string }) => row.reference),
      );
      expect(refs).toHaveLength(json.body.total);
      return refs;
    };
    expect(await matchingRefs(query)).toEqual([midnight, last]);
    expect(await matchingRefs({ ...query, sort: 'newest' })).toEqual([
      last,
      midnight,
    ]);
    expect(
      await matchingRefs({ ...query, search: '  SENATE 50%_\\  ' }),
    ).toEqual([midnight, last]);
    expect(
      await matchingRefs({ ...query, search: midnight.toLowerCase() }),
    ).toEqual([midnight]);
    for (const excluded of [
      { officerId: formerId },
      { status: 'completed' },
      { category: 'electrical' },
      { priority: 'low' },
      { search: '50Xanything' },
    ]) {
      expect(await matchingRefs({ ...query, ...excluded })).toEqual([]);
    }
    const { submittedFrom, submittedTo, ...withoutDays } = query;
    expect(await matchingRefs({ ...withoutDays, submittedFrom })).toEqual([
      midnight,
      last,
      after,
    ]);
    expect(await matchingRefs({ ...withoutDays, submittedTo })).toEqual([
      before,
      midnight,
      last,
    ]);
  });

  it('projects current completion dates and safe erased names without personal metadata', async () => {
    const requester = await app.signUp('requester@example.com');
    const requesterId = await idOf(requester);
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const officerId = await idOf(officer);
    const reference = await submitServiceRequest(
      requester,
      aServiceRequest({
        location: 'Library',
        description: 'PRIVATE DESCRIPTION THAT MUST NOT BE EXPORTED',
      }),
    );
    await assign(admin, reference, officerId);
    await officer.post(`/api/service-requests/${reference}/start`).expect(200);
    app.clock.advance(60_000);
    await officer
      .post(`/api/service-requests/${reference}/complete`)
      .expect(200);
    expect((await admin.get(endpoint).expect(200)).text).toBe(
      header +
        `${reference},Leaking tap,Plumbing,Library,Normal,Completed,Ada Lovelace,Chinedu Eze,2026-11-12T09:00:00.000Z,2026-11-12T09:01:00.000Z,\r\n`,
    );
    await requester
      .post(`/api/service-requests/${reference}/not-fixed`)
      .send({ reason: 'The pipe still leaks.' })
      .expect(200);
    expect((await admin.get(endpoint).expect(200)).text).toBe(
      header +
        `${reference},Leaking tap,Plumbing,Library,Normal,Assigned,Ada Lovelace,Chinedu Eze,2026-11-12T09:00:00.000Z,,\r\n`,
    );
    await officer.post(`/api/service-requests/${reference}/start`).expect(200);
    app.clock.advance(60_000);
    await officer
      .post(`/api/service-requests/${reference}/complete`)
      .expect(200);
    app.clock.advance(60_000);
    await requester
      .post(`/api/service-requests/${reference}/verify`)
      .expect(200);
    await admin.post(`/api/users/${requesterId}/erase`).expect(200);
    await admin.post(`/api/users/${officerId}/erase`).expect(200);
    const exported = await admin
      .get(endpoint)
      .query({ search: 'Erased user' })
      .expect(200);
    expect(exported.text).toBe(
      header +
        `${reference},Leaking tap,Plumbing,Library,Normal,Verified,Erased user,Erased user,2026-11-12T09:00:00.000Z,2026-11-12T09:02:00.000Z,2026-11-12T09:03:00.000Z\r\n`,
    );
    expect(
      (await admin.get(endpoint).query({ search: 'Ada' }).expect(200)).text,
    ).toBe(header);
  });

  it('renders cancelled work without completion dates or an ended officer', async () => {
    const requester = await app.signUp('requester@example.com');
    const admin = await app.signInAsAdministrator();
    const officer = await app.signInAsMaintenanceOfficer();
    const reference = await submitServiceRequest(
      requester,
      aServiceRequest({ location: 'Library' }),
    );
    await assign(admin, reference, await idOf(officer));
    await admin
      .post(`/api/service-requests/${reference}/cancel`)
      .send({ reason: 'Duplicate report.' })
      .expect(200);
    expect((await admin.get(endpoint).expect(200)).text).toBe(
      header +
        `${reference},Leaking tap,Plumbing,Library,Normal,Cancelled,Ada Lovelace,,2026-11-12T09:00:00.000Z,,\r\n`,
    );
  });

  it.each(['+repairs', '-repairs', '@repairs'])(
    'keeps formula-like title and current officer text inert: %s',
    async (title) => {
      const requester = await app.signUp('requester@example.com');
      const admin = await app.signInAsAdministrator();
      const officer = await app.signInAsMaintenanceOfficer(
        'officer@example.com',
        { firstName: '@Chinedu', lastName: 'Eze' },
      );
      const reference = await submitServiceRequest(
        requester,
        aServiceRequest({ title, location: '-needs "repairs"\rsoon' }),
      );
      await assign(admin, reference, await idOf(officer));
      expect((await admin.get(endpoint).expect(200)).text).toBe(
        header +
          `${reference},'${title},Plumbing,"'-needs ""repairs""\rsoon",Normal,Assigned,Ada Lovelace,'@Chinedu Eze,2026-11-12T09:00:00.000Z,,\r\n`,
      );
    },
  );

  it('orders Urgent through Low, then oldest Submitted time before newer requests', async () => {
    const admin = await app.signInAsAdministrator();
    const refs = [];
    for (const priority of ['low', 'urgent', 'high', 'normal', 'urgent']) {
      app.clock.advance(1_000);
      const reference = await submitServiceRequest(
        admin,
        aServiceRequest({ location: 'Library' }),
      );
      await admin
        .put(`/api/service-requests/${reference}/priority`)
        .send({ priority })
        .expect(200);
      refs.push(reference);
    }
    const exported = await admin
      .get(endpoint)
      .query({ sort: 'priority' })
      .expect(200);
    expect(
      exported.text
        .split('\r\n')
        .slice(1, -1)
        .map((row: string) => row.split(',')[0]),
    ).toEqual([refs[1], refs[4], refs[2], refs[3], refs[0]]);
  });
});
