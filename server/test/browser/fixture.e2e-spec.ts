import { startBrowserFixture } from './fixture.js';

describe('Loopback browser test fixture', () => {
  let fixture: Awaited<ReturnType<typeof startBrowserFixture>>;
  const control = (path: string, body?: unknown) =>
    fetch(`${fixture.controlUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  const requestLink = (email: string) =>
    fetch(`${fixture.apiUrl}/api/auth/sign-in-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  const mailTo = async (email: string) => {
    const response = await fetch(
      `${fixture.controlUrl}/mail?email=${encodeURIComponent(email)}`,
    );
    expect(response.status).toBe(200);
    return response.json();
  };

  beforeAll(async () => {
    fixture = await startBrowserFixture({ apiPort: 0, controlPort: 0 });
  });
  beforeEach(async () => {
    expect((await control('/reset')).status).toBe(200);
  });
  afterAll(() => fixture.close());

  it('binds both servers to loopback and exposes readiness without a signed-in user', async () => {
    expect(new URL(fixture.apiUrl).hostname).toBe('127.0.0.1');
    expect(new URL(fixture.controlUrl).hostname).toBe('127.0.0.1');
    const health = await fetch(`${fixture.controlUrl}/health`);
    expect(await health.json()).toEqual({
      ok: true,
      apiUrl: fixture.apiUrl,
      clientUrl: 'http://127.0.0.1:5173',
    });
    expect((await fetch(`${fixture.apiUrl}/api/auth/me`)).status).toBe(401);
  });

  it('captures real API mail and can expire its link using the test clock', async () => {
    expect(
      (await fetch(`${fixture.controlUrl}/mail?email=ada@example.test`)).status,
    ).toBe(404);
    expect((await requestLink('ada@example.test')).status).toBe(202);
    const mail = await mailTo('ada@example.test');
    const link = new URL(mail.link);
    expect(link.origin + link.pathname).toBe(
      'http://127.0.0.1:5173/sign-in/link',
    );
    expect(mail.text).toContain(mail.link);
    const advanced = await control('/advance', {
      milliseconds: 16 * 60 * 1000,
    });
    expect(await advanced.json()).toEqual({ now: '2026-11-12T09:16:00.000Z' });
    const consumed = await fetch(
      `${fixture.apiUrl}/api/auth/sign-in-link/consume`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: link.searchParams.get('token') }),
      },
    );
    expect(consumed.status).toBe(401);
    await control('/reset');
    expect(
      (await fetch(`${fixture.controlUrl}/mail?email=ada@example.test`)).status,
    ).toBe(404);
  });

  it('issues a fake Google code for the actual authorization transaction and signs in through the callback', async () => {
    const started = await fetch(
      `${fixture.apiUrl}/api/auth/oidc/google/login`,
      { redirect: 'manual' },
    );
    expect(started.status).toBe(302);
    const approved = await control('/google', {
      authorizationUrl: started.headers.get('location'),
      account: {
        sub: 'browser-ada',
        email: 'ada@example.test',
        givenName: 'Ada',
        familyName: 'Lovelace',
      },
    });
    expect(approved.status).toBe(200);
    const callback = new URL((await approved.json()).callbackUrl);
    expect(callback.origin).toBe('http://127.0.0.1:5173');
    expect(callback.searchParams.get('state')).toBe(
      new URL(started.headers.get('location')!).searchParams.get('state'),
    );
    const signedIn = await fetch(
      `${fixture.apiUrl}${callback.pathname}${callback.search}`,
      {
        redirect: 'manual',
        headers: { cookie: cookies(started) },
      },
    );
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get('location')).toBe('/');
    const me = await fetch(`${fixture.apiUrl}/api/auth/me`, {
      headers: { cookie: cookies(signedIn) },
    });
    expect(await me.json()).toMatchObject({
      email: 'ada@example.test',
      firstName: 'Ada',
      signUpComplete: false,
    });
    await control('/reset');
    expect(
      (
        await fetch(`${fixture.apiUrl}/api/auth/me`, {
          headers: { cookie: cookies(signedIn) },
        })
      ).status,
    ).toBe(401);
  });

  it('invites through the Administrator API and preserves the invited name and Role', async () => {
    const invited = await control('/invite', {
      email: 'officer@example.test',
      firstName: 'Katherine',
      lastName: 'Johnson',
      role: 'maintenance_officer',
    });
    expect(invited.status).toBe(201);
    expect(await invited.json()).toMatchObject({
      role: 'maintenance_officer',
      status: 'invited',
    });
    const invitation = await mailTo('officer@example.test');
    expect(new URL(invitation.link).pathname).toBe('/register');
    await requestLink('officer@example.test');
    const mail = await mailTo('officer@example.test');
    const consumed = await fetch(
      `${fixture.apiUrl}/api/auth/sign-in-link/consume`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: new URL(mail.link).searchParams.get('token'),
        }),
      },
    );
    expect(consumed.status).toBe(200);
    const me = await fetch(`${fixture.apiUrl}/api/auth/me`, {
      headers: { cookie: cookies(consumed) },
    });
    expect(await me.json()).toMatchObject({
      firstName: 'Katherine',
      role: 'maintenance_officer',
      signUpComplete: true,
    });
  });

  it('rejects browser-origin controls and malformed control input', async () => {
    const crossOrigin = await fetch(`${fixture.controlUrl}/reset`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(crossOrigin.status).toBe(403);
    expect((await control('/advance', { milliseconds: -1 })).status).toBe(400);
    expect(
      (
        await control('/google', {
          authorizationUrl: 'https://evil.example',
          account: { sub: 'x', email: 'x@example.test' },
        })
      ).status,
    ).toBe(400);
    expect((await control('/unknown')).status).toBe(404);
  });

  it('refuses to start outside the test environment', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(
        startBrowserFixture({ apiPort: 0, controlPort: 0 }),
      ).rejects.toThrow('requires NODE_ENV=test');
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
