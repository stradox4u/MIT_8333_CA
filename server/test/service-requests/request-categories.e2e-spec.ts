import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Request Categories', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('lists the six Request Categories with their codes, in order', async () => {
    const student = await app.signUp('student@example.com');

    const listed = await student.get('/api/request-categories').expect(200);

    expect(listed.body).toEqual([
      { id: 'electrical', name: 'Electrical', code: 'ELEC' },
      { id: 'plumbing', name: 'Plumbing', code: 'PLUMB' },
      { id: 'furniture', name: 'Furniture', code: 'FURN' },
      { id: 'network', name: 'Internet and network', code: 'NET' },
      {
        id: 'classroom_equipment',
        name: 'Classroom equipment',
        code: 'CLASS',
      },
      { id: 'other', name: 'Other', code: 'OTHER' },
    ]);
  });

  it('refuses a Pending Sign-up', async () => {
    const pending = await app.signInByLink('pending@example.com');

    await pending.get('/api/request-categories').expect(403);
  });

  it('needs a signed-in User', async () => {
    await app.browser().get('/api/request-categories').expect(401);
  });
});
