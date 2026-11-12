import { createTestApp, type TestApp } from '../support/test-app.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('The daily cleanup', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  const accountIdOf = async (email: string) => {
    const browser = await app.signInByLink(email);
    const me = await browser.get('/api/auth/me').expect(200);
    return me.body.id as string;
  };

  it('deletes a Pending Sign-up left unfinished for 7 days', async () => {
    const before = await accountIdOf('pending@example.com');

    app.clock.advance(7 * DAY);
    await app.runDailyCleanup();

    expect(await accountIdOf('pending@example.com')).not.toBe(before);
  });

  it('keeps a Pending Sign-up younger than 7 days', async () => {
    const before = await accountIdOf('pending@example.com');

    app.clock.advance(7 * DAY - HOUR);
    await app.runDailyCleanup();

    expect(await accountIdOf('pending@example.com')).toBe(before);
  });

  it('never deletes a User', async () => {
    const ada = await app.signUp('ada@example.com');
    const { body: before } = await ada.get('/api/auth/me').expect(200);

    app.clock.advance(30 * DAY);
    await app.runDailyCleanup();

    expect(await accountIdOf('ada@example.com')).toBe(before.id);
  });

  it('keeps an Invitation that was never accepted', async () => {
    const admin = await app.signInAsAdministrator();
    await admin
      .post('/api/users')
      .send({
        firstName: 'Katherine',
        lastName: 'Johnson',
        email: 'katherine@example.com',
        role: 'maintenance_officer',
      })
      .expect(201);

    app.clock.advance(30 * DAY);
    await app.runDailyCleanup();

    const katherine = await app.signInByLink('katherine@example.com');
    const me = await katherine.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ role: 'maintenance_officer' });
  });
});
