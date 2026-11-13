import { aServiceRequest } from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Submitting a Service Request', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('answers 201 with its Reference', async () => {
    const student = await app.signUp('student@example.com');

    const submitted = await student
      .post('/api/service-requests')
      .send(aServiceRequest({ categoryId: 'plumbing' }))
      .expect(201);

    expect(submitted.body).toEqual({ reference: 'SR-PLUMB-1' });
  });

  it('numbers each Request Category’s References separately', async () => {
    const student = await app.signUp('student@example.com');
    const submit = async (categoryId: string) => {
      const submitted = await student
        .post('/api/service-requests')
        .send(aServiceRequest({ categoryId }))
        .expect(201);
      return submitted.body.reference;
    };

    expect(await submit('plumbing')).toBe('SR-PLUMB-1');
    expect(await submit('plumbing')).toBe('SR-PLUMB-2');
    expect(await submit('electrical')).toBe('SR-ELEC-1');
    expect(await submit('plumbing')).toBe('SR-PLUMB-3');
  });

  it('gives simultaneous submissions in one Request Category different numbers', async () => {
    const student = await app.signUp('student@example.com');
    const staff = await app.signUp('staff@example.com', { role: 'staff' });

    const submitted = await Promise.all(
      [student, staff, student, staff].map((browser) =>
        browser.post('/api/service-requests').send(aServiceRequest()),
      ),
    );

    expect(submitted.map((response) => response.body.reference).sort()).toEqual(
      ['SR-PLUMB-1', 'SR-PLUMB-2', 'SR-PLUMB-3', 'SR-PLUMB-4'],
    );
  });

  describe('validation', () => {
    it.each([
      { field: 'title', value: 'ab', why: 'under 3 characters' },
      { field: 'title', value: 'a'.repeat(121), why: 'over 120 characters' },
      { field: 'title', value: '  ab  ', why: 'under 3 characters once trimmed' },
      { field: 'location', value: 'A', why: 'under 2 characters' },
      { field: 'location', value: 'a'.repeat(201), why: 'over 200 characters' },
      { field: 'description', value: 'Too short', why: 'under 10 characters' },
      {
        field: 'description',
        value: 'a'.repeat(5001),
        why: 'over 5,000 characters',
      },
    ])('refuses a $field $why', async ({ field, value }) => {
      const student = await app.signUp('student@example.com');

      const refused = await student
        .post('/api/service-requests')
        .send(aServiceRequest({ [field]: value }))
        .expect(400);

      expect(refused.body.issues).toEqual([
        { path: [field], message: expect.any(String) },
      ]);
    });

    it.each([
      { field: 'title', value: 'abc', limit: '3 characters' },
      { field: 'title', value: 'a'.repeat(120), limit: '120 characters' },
      { field: 'location', value: 'B2', limit: '2 characters' },
      { field: 'location', value: 'a'.repeat(200), limit: '200 characters' },
      { field: 'description', value: 'No power!!', limit: '10 characters' },
      {
        field: 'description',
        value: 'a'.repeat(5000),
        limit: '5,000 characters',
      },
    ])('accepts a $field of $limit', async ({ field, value }) => {
      const student = await app.signUp('student@example.com');

      await student
        .post('/api/service-requests')
        .send(aServiceRequest({ [field]: value }))
        .expect(201);
    });

    it('refuses a Request Category that doesn’t exist', async () => {
      const student = await app.signUp('student@example.com');

      const refused = await student
        .post('/api/service-requests')
        .send(aServiceRequest({ categoryId: 'gardening' }))
        .expect(400);

      expect(refused.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        issues: [{ path: ['categoryId'], message: expect.any(String) }],
      });
    });

    it('refuses a body with missing fields', async () => {
      const student = await app.signUp('student@example.com');

      const refused = await student
        .post('/api/service-requests')
        .send({ title: 'Leaking tap' })
        .expect(400);

      expect(
        refused.body.issues.map((issue: { path: string[] }) => issue.path),
      ).toEqual([['categoryId'], ['location'], ['description']]);
    });
  });

  it('refuses a Pending Sign-up', async () => {
    const pending = await app.signInByLink('pending@example.com');

    await pending
      .post('/api/service-requests')
      .send(aServiceRequest())
      .expect(403);
  });
});
