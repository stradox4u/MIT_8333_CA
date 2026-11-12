import { createTestApp, type TestApp } from '../support/test-app.js';

const PASSWORD = 'Analytical-Engine-1843';
const MINUTE = 60 * 1000;

describe('Throttling', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const signIn = (password: string) =>
    app
      .browser()
      .post('/api/auth/sign-in')
      .send({ email: 'ada@example.com', password });

  const requestLink = (email: string, ip: string) =>
    app
      .browser()
      .post('/api/auth/sign-in-link')
      .set('X-Forwarded-For', ip)
      .send({ email });

  describe('password sign-in', () => {
    beforeEach(async () => {
      const ada = await app.signUp('ada@example.com');
      await ada
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(204);
    });

    it('refuses a 6th attempt on one account within 15 minutes, even with the right password', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn('Wrong-Password-1').expect(401);
      }

      await signIn(PASSWORD).expect(429);
    });

    it('lets the account try again once 15 minutes have passed', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn('Wrong-Password-1').expect(401);
      }

      app.clock.advance(15 * MINUTE);

      await signIn(PASSWORD).expect(200);
    });
  });

  describe('Sign-in Link requests', () => {
    it('refuses a 4th request for one address from one IP within 15 minutes', async () => {
      for (let request = 0; request < 3; request++) {
        await requestLink('ada@example.com', '203.0.113.7').expect(202);
      }

      await requestLink('ada@example.com', '203.0.113.7').expect(429);
    });

    it('still serves that address from another IP', async () => {
      for (let request = 0; request < 3; request++) {
        await requestLink('ada@example.com', '203.0.113.7').expect(202);
      }

      await requestLink('ada@example.com', '198.51.100.20').expect(202);
    });

    it('refuses an 11th request from one IP within 15 minutes', async () => {
      for (let request = 0; request < 10; request++) {
        await requestLink(`person${request}@example.com`, '203.0.113.7').expect(
          202,
        );
      }

      await requestLink('someone-else@example.com', '203.0.113.7').expect(429);
    });
  });
});
