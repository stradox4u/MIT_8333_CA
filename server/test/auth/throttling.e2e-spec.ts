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

    it('does not count successful sign-ins', async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        await signIn(PASSWORD).expect(200);
      }
    });

    it('holds the limit when wrong passwords arrive all at once', async () => {
      const answers = await Promise.all(
        Array.from({ length: 20 }, () => signIn('Wrong-Password-1')),
      );

      const statuses = answers.map((answer) => answer.status);
      expect(statuses.filter((status) => status === 401)).toHaveLength(5);
      expect(statuses.filter((status) => status === 429)).toHaveLength(15);
    });

    it('lets simultaneous correct sign-ins leave nothing counted behind', async () => {
      await Promise.all(Array.from({ length: 8 }, () => signIn(PASSWORD)));

      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn('Wrong-Password-1').expect(401);
      }
      await signIn('Wrong-Password-1').expect(429);
    });

    it('lets the account try again once 15 minutes have passed', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn('Wrong-Password-1').expect(401);
      }

      app.clock.advance(15 * MINUTE);

      await signIn(PASSWORD).expect(200);
    });
  });

  describe('confirming with the current password', () => {
    it('counts wrong guesses toward the same lockout as sign-in', async () => {
      const ada = await app.signUp('ada@example.com');
      await ada
        .put('/api/auth/password')
        .send({ newPassword: PASSWORD })
        .expect(204);
      app.clock.advance(11 * MINUTE);

      for (let guess = 0; guess < 5; guess++) {
        await ada
          .put('/api/auth/password')
          .send({
            currentPassword: 'Wrong-Password-1',
            newPassword: `${PASSWORD}!`,
          })
          .expect(403);
      }

      await ada
        .put('/api/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: `${PASSWORD}!` })
        .expect(429);
      await signIn(PASSWORD).expect(429);
    });
  });

  describe('Sign-in Link requests', () => {
    it('refuses a 4th request for one address from one IP within 15 minutes', async () => {
      for (let request = 0; request < 3; request++) {
        await requestLink('ada@example.com', '203.0.113.7').expect(202);
      }

      await requestLink('ada@example.com', '203.0.113.7').expect(429);
    });

    it('tells a refused client to retry in seconds, once the block ends', async () => {
      for (let request = 0; request < 3; request++) {
        await requestLink('ada@example.com', '203.0.113.7').expect(202);
      }

      const refused = await requestLink(
        'ada@example.com',
        '203.0.113.7',
      ).expect(429);

      // 15 minutes, in seconds, as HTTP's Retry-After counts; the standard
      // header too, for clients and proxies that only know that one.
      expect(refused.headers['retry-after-peraccount']).toBe('900');
      expect(refused.headers['retry-after']).toBe('900');
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

  describe('Sign-in Link requests when per-IP limits are off', () => {
    let withoutIpLimits: TestApp;

    beforeAll(async () => {
      withoutIpLimits = await createTestApp({
        config: { rateLimitByIp: false },
      });
    });
    beforeEach(() => withoutIpLimits.reset());
    afterAll(() => withoutIpLimits.close());

    it('still limits one address to 3 requests, whatever IP they come from', async () => {
      const ips = ['203.0.113.7', '198.51.100.20', '192.0.2.33'];
      for (const ip of ips) {
        await withoutIpLimits
          .browser()
          .post('/api/auth/sign-in-link')
          .set('X-Forwarded-For', ip)
          .send({ email: 'ada@example.com' })
          .expect(202);
      }

      await withoutIpLimits
        .browser()
        .post('/api/auth/sign-in-link')
        .set('X-Forwarded-For', '192.0.2.99')
        .send({ email: 'ada@example.com' })
        .expect(429);
    });
  });
});
