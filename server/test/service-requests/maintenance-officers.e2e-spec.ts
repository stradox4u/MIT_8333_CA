import {
  assign,
  idOf,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('The Maintenance Officers to choose from', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('lists the active officers by name, with their counts of Open Assignments', async () => {
    const ada = await app.signUp('ada@example.com');
    const admin = await app.signInAsAdministrator();
    const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com', {
      firstName: 'Ngozi',
      lastName: 'Okafor',
    });
    const chinedu = await app.signInAsMaintenanceOfficer(
      'chinedu@example.com',
      { firstName: 'Chinedu', lastName: 'Eze' },
    );
    const chineduId = await idOf(chinedu);
    const open = await submitServiceRequest(ada);
    const inProgress = await submitServiceRequest(ada);
    const completed = await submitServiceRequest(ada);
    for (const reference of [open, inProgress, completed]) {
      await assign(admin, reference, chineduId);
    }
    for (const reference of [inProgress, completed]) {
      await chinedu.post(`/api/service-requests/${reference}/start`);
    }
    await chinedu.post(`/api/service-requests/${completed}/complete`);

    const listed = await admin.get('/api/maintenance-officers').expect(200);

    expect(listed.body).toEqual([
      { id: chineduId, name: 'Chinedu Eze', openAssignments: 2 },
      { id: await idOf(ngozi), name: 'Ngozi Okafor', openAssignments: 0 },
    ]);
  });

  it('leaves out invited officers who never signed in, deactivated ones, and other Roles', async () => {
    const admin = await app.signInAsAdministrator();
    await app.signUp('student@example.com');
    await admin
      .post('/api/users')
      .send({
        firstName: 'Invited',
        lastName: 'Officer',
        email: 'invited@example.com',
        role: 'maintenance_officer',
      })
      .expect(201);
    const gone = await app.signInAsMaintenanceOfficer('gone@example.com');
    await admin.post(`/api/users/${await idOf(gone)}/deactivate`).expect(200);

    const listed = await admin.get('/api/maintenance-officers').expect(200);

    expect(listed.body).toEqual([]);
  });

  it('is only for Administrators', async () => {
    const student = await app.signUp('student@example.com');
    const officer = await app.signInAsMaintenanceOfficer();

    await student.get('/api/maintenance-officers').expect(403);
    await officer.get('/api/maintenance-officers').expect(403);
  });
});
