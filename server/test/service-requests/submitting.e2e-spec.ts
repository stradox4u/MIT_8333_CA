import {
  aServiceRequest,
  submitServiceRequest,
} from '../support/service-requests.js';
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

  it('raises it in the signed-in User’s name, whatever the body says', async () => {
    const ada = await app.signUp('ada@example.com');
    const grace = await app.signUp('grace@example.com');
    const graceId = (await grace.get('/api/auth/me').expect(200)).body.id;

    const reference = await submitServiceRequest(ada, {
      ...aServiceRequest(),
      requesterId: graceId,
    });

    await ada.get(`/api/service-requests/${reference}`).expect(200);
    await grace.get(`/api/service-requests/${reference}`).expect(404);
  });

  it('numbers each Request Category’s References separately', async () => {
    const student = await app.signUp('student@example.com');
    const submit = (categoryId: string) =>
      submitServiceRequest(student, aServiceRequest({ categoryId }));

    expect(await submit('plumbing')).toBe('SR-PLUMB-1');
    expect(await submit('plumbing')).toBe('SR-PLUMB-2');
    expect(await submit('electrical')).toBe('SR-ELEC-1');
    expect(await submit('plumbing')).toBe('SR-PLUMB-3');
  });

  // PGlite runs one transaction at a time, so this only checks the References
  // come out distinct. It can't make two transactions race for the category's
  // row: that's the row lock UPDATE … RETURNING takes in Postgres.
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
      ['title', 'under 3 characters', 'ab'],
      ['title', 'over 120 characters', 'a'.repeat(121)],
      ['title', 'under 3 characters once trimmed', '  ab  '],
      ['location', 'under 2 characters', 'A'],
      ['location', 'over 200 characters', 'a'.repeat(201)],
      ['description', 'under 10 characters', 'Too short'],
      ['description', 'over 5,000 characters', 'a'.repeat(5001)],
    ])('refuses a %s %s', async (field, _why, value) => {
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
      ['title', '3 characters', 'abc'],
      ['title', '120 characters', 'a'.repeat(120)],
      ['location', '2 characters', 'B2'],
      ['location', '200 characters', 'a'.repeat(200)],
      ['description', '10 characters', 'No power!!'],
      ['description', '5,000 characters', 'a'.repeat(5000)],
    ])('accepts a %s of %s', async (field, _limit, value) => {
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

  it('needs a signed-in User', async () => {
    await app
      .browser()
      .post('/api/service-requests')
      .send(aServiceRequest())
      .expect(401);
  });
});
