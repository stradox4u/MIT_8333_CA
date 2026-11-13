import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import {
  type Browser,
  createTestApp,
  type TestApp,
} from '../support/test-app.js';

const MINUTE = 60 * 1000;

describe('Listing Service Requests by scope', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const list = (
    browser: Browser,
    scope: string,
    query: Record<string, unknown> = {},
  ) => browser.get('/api/service-requests').query({ scope, ...query });

  const referencesOf = (body: { items: { reference: string }[] }) =>
    body.items.map((item) => item.reference);

  describe('assigned: the requests a Maintenance Officer has held an Assignment for', () => {
    it('lists the current ones and the ones taken away, newest first, with Priority only on the current', async () => {
      const ada = await app.signUp('ada@example.com');
      const admin = await app.signInAsAdministrator();
      const chinedu = await app.signInAsMaintenanceOfficer(
        'chinedu@example.com',
      );
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      const kept = await submitServiceRequest(ada);
      app.clock.advance(MINUTE);
      const takenAway = await submitServiceRequest(ada);
      app.clock.advance(MINUTE);
      const someoneElses = await submitServiceRequest(ada);
      await assign(admin, kept, await idOf(chinedu));
      await assign(admin, takenAway, await idOf(chinedu));
      await assign(admin, takenAway, await idOf(ngozi));
      await assign(admin, someoneElses, await idOf(ngozi));

      const listed = await list(chinedu, 'assigned').expect(200);

      expect(listed.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
      expect(listed.body.items).toEqual([
        expect.objectContaining({
          reference: takenAway,
          assignment: expect.objectContaining({
            officer: expect.objectContaining({ id: await idOf(ngozi) }),
          }),
        }),
        expect.objectContaining({ reference: kept, priority: 'normal' }),
      ]);
      expect(listed.body.items[0]).not.toHaveProperty('priority');
    });

    it('filters by Status, including open, and pages', async () => {
      const ada = await app.signUp('ada@example.com');
      const admin = await app.signInAsAdministrator();
      const officer = await app.signInAsMaintenanceOfficer();
      const officerId = await idOf(officer);
      const done = await submitServiceRequest(ada);
      const open = await submitServiceRequest(ada);
      await assign(admin, done, officerId);
      await assign(admin, open, officerId);
      await officer.post(`/api/service-requests/${done}/start`).expect(200);
      await officer.post(`/api/service-requests/${done}/complete`).expect(200);

      const openOnes = await list(officer, 'assigned', { status: 'open' });
      const completed = await list(officer, 'assigned', {
        status: 'completed',
      });
      const firstPage = await list(officer, 'assigned', { pageSize: 1 });

      expect(referencesOf(openOnes.body)).toEqual([open]);
      expect(referencesOf(completed.body)).toEqual([done]);
      expect(firstPage.body).toMatchObject({ pageSize: 1, total: 2 });
      expect(firstPage.body.items).toHaveLength(1);
    });

    it('is only for Maintenance Officers', async () => {
      const student = await app.signUp('student@example.com');
      const admin = await app.signInAsAdministrator();

      await list(student, 'assigned').expect(403);
      await list(admin, 'assigned').expect(403);
    });
  });

  describe('all: every Service Request, for Administrators', () => {
    it('lists everyone’s, newest first, with Priority and the current Assignment', async () => {
      const ada = await app.signUp('ada@example.com');
      const grace = await app.signUp('grace@example.com');
      const admin = await app.signInAsAdministrator();
      const officer = await app.signInAsMaintenanceOfficer();
      const first = await submitServiceRequest(ada);
      app.clock.advance(MINUTE);
      const second = await submitServiceRequest(grace);
      await assign(admin, first, await idOf(officer));

      const listed = await list(admin, 'all').expect(200);

      expect(listed.body).toMatchObject({ total: 2 });
      expect(listed.body.items).toEqual([
        expect.objectContaining({
          reference: second,
          priority: 'normal',
          assignment: null,
        }),
        expect.objectContaining({
          reference: first,
          priority: 'normal',
          status: 'assigned',
          assignment: {
            officer: { id: await idOf(officer), name: 'Chinedu Eze' },
            assignedAt: '2026-11-12T09:01:00.000Z',
          },
        }),
      ]);
    });

    it('filters by Status', async () => {
      const ada = await app.signUp('ada@example.com');
      const admin = await app.signInAsAdministrator();
      const officer = await app.signInAsMaintenanceOfficer();
      const assigned = await submitServiceRequest(ada);
      const submitted = await submitServiceRequest(ada);
      await assign(admin, assigned, await idOf(officer));

      const listed = await list(admin, 'all', { status: 'submitted' });

      expect(referencesOf(listed.body)).toEqual([submitted]);
    });

    it('is only for Administrators', async () => {
      const student = await app.signUp('student@example.com');
      const officer = await app.signInAsMaintenanceOfficer();

      await list(student, 'all').expect(403);
      await list(officer, 'all').expect(403);
    });
  });
});
