import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { browserTestEnvironment } from './environment.js';

const advanceBody = z.object({
  milliseconds: z
    .number()
    .int()
    .nonnegative()
    .max(365 * 24 * 60 * 60 * 1000),
});
const googleBody = z.object({
  authorizationUrl: z.url(),
  account: z.object({
    sub: z.string().min(1),
    email: z.string().min(1),
    emailVerified: z.boolean().optional(),
    givenName: z.string().optional(),
    familyName: z.string().optional(),
  }),
});
const inviteBody = z.object({
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
});
const ADMIN_EMAIL = 'browser-fixture-admin@example.test';

/** Separate loopback controls, never registered on the production Nest app. */
export async function startBrowserFixture({
  apiPort = 4174,
  controlPort = 4175,
} = {}) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Browser fixture requires NODE_ENV=test');
  }
  Object.assign(process.env, browserTestEnvironment);
  // A static import would let ConfigModule read .env before test isolation.
  const { createTestApp } = await import('../support/test-app.js');
  const app = await createTestApp({
    port: apiPort,
    photoBaseUrl: apiPort
      ? `http://127.0.0.1:${apiPort}/__test/photos`
      : undefined,
    config: { appUrl: browserTestEnvironment.APP_URL, cookiesAreSecure: false },
  });
  let administrator:
    Awaited<ReturnType<typeof app.signInAsAdministrator>> | undefined;

  const controls = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(
        response,
        error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500,
        {
          error:
            error instanceof z.ZodError || error instanceof SyntaxError
              ? 'invalid_request'
              : 'fixture_failed',
        },
      );
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    // Only the test runner uses controls; pages never get cross-origin access.
    if (request.headers.origin)
      return json(response, 403, { error: 'runner_only' });
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, {
        ok: true,
        apiUrl: app.url,
        clientUrl: browserTestEnvironment.APP_URL,
      });
    }
    if (request.method === 'GET' && url.pathname === '/mail') {
      const email = z.email().parse(url.searchParams.get('email'));
      const mail = app.mailbox.find({ to: email });
      return mail
        ? json(response, 200, {
            email,
            subject: mail.subject,
            text: mail.text ?? '',
            links: mail.links,
            link: mail.links[0] ?? null,
          })
        : json(response, 404, { error: 'mail_not_found' });
    }
    if (request.method !== 'POST')
      return json(response, 404, { error: 'not_found' });
    if (url.pathname === '/reset') {
      await app.reset();
      administrator = undefined;
      return json(response, 200, { ok: true });
    }
    if (url.pathname === '/advance') {
      const { milliseconds } = advanceBody.parse(await readJson(request));
      app.clock.advance(milliseconds);
      return json(response, 200, {
        now: new Date(app.clock.now()).toISOString(),
      });
    }
    if (url.pathname === '/google') {
      const { authorizationUrl, account } = googleBody.parse(
        await readJson(request),
      );
      let callbackUrl: string;
      try {
        callbackUrl = app.googleCallbackFor(authorizationUrl, account);
      } catch {
        return json(response, 400, { error: 'invalid_authorization_url' });
      }
      return json(response, 200, { callbackUrl });
    }
    if (url.pathname === '/invite') {
      const invitee = inviteBody.parse(await readJson(request));
      if (!administrator)
        administrator = await app.signInAsAdministrator(ADMIN_EMAIL);
      else if ((await administrator.get('/api/auth/me')).status === 401) {
        administrator = await app.signInByLink(ADMIN_EMAIL);
      }
      const invited = await administrator.post('/api/users').send(invitee);
      return json(response, invited.status, invited.body);
    }
    return json(response, 404, { error: 'not_found' });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      controls.once('error', reject);
      controls.listen(controlPort, '127.0.0.1', () => {
        controls.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await app.close();
    throw error;
  }
  const controlUrl = `http://127.0.0.1:${(controls.address() as AddressInfo).port}`;
  let closing: Promise<void> | undefined;
  return {
    apiUrl: app.url,
    controlUrl,
    close() {
      closing ??= (async () => {
        try {
          await new Promise<void>((resolve, reject) =>
            controls.close((error) => (error ? reject(error) : resolve())),
          );
        } finally {
          await app.close();
        }
      })();
      return closing;
    },
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new SyntaxError('Expected application/json');
  }
  request.setEncoding('utf8');
  let body = '';
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 16_384) tooLarge = true;
    if (!tooLarge) body += chunk;
  }
  if (tooLarge) throw new SyntaxError('Body too large');
  return JSON.parse(body);
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}
