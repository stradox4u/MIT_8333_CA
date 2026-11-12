import { createTestApp, type TestApp } from '../support/test-app.js';

describe('Sign-in Links', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('signs a first-time visitor in as a Pending Sign-up', async () => {
    const browser = app.browser();

    await browser
      .post('/api/auth/sign-in-link')
      .send({ email: 'ada@example.com', keepSignedIn: false })
      .expect(202);
    const token = await app.signInLinkTokenSentTo('ada@example.com');
    await browser
      .post('/api/auth/sign-in-link/consume')
      .send({ token })
      .expect(200);

    const me = await browser.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: 'ada@example.com',
      signUpComplete: false,
    });
  });

  it('answers a consume request without a token with 400, not a server error', async () => {
    await app
      .browser()
      .post('/api/auth/sign-in-link/consume')
      .send({})
      .expect(400);
  });
});
