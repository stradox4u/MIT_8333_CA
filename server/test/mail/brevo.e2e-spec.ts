import { ConfigService } from '@nestjs/config';
import { Mailer, MailModule } from '@nestjs/mail';
import { Test, type TestingModule } from '@nestjs/testing';
import { inspect } from 'node:util';
import { AppConfig } from '../../src/config/app-config.js';
import { environment, type Environment } from '../../src/config/environment.js';
import { createMailTransport } from '../../src/mail/mail-transport.js';

describe('Configured Brevo HTTPS delivery', () => {
  let module: TestingModule;
  let mailer: Mailer;
  const fetchMock = vi.fn<typeof fetch>();
  const message = {
    to: 'Recipient <recipient@example.test>',
    subject: 'Service request assigned',
    text: 'Open https://maintenance.example/requests/SR-PLUMB-42',
  };

  beforeEach(async () => {
    fetchMock
      .mockReset()
      .mockResolvedValue(
        Response.json({ messageId: '<brevo-id>' }, { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const settings = environment.parse({
      APP_URL: 'https://maintenance.example',
      DATABASE_URL: 'postgres://test:test@localhost/test',
      S3_BUCKET: 'test-photos',
      S3_REGION: 'eu-west-1',
      S3_ACCESS_KEY_ID: 'test-key',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_KEY_PREFIX: 'test-env/',
      MAIL_TRANSPORT: 'brevo',
      BREVO_API_KEY: 'test-api-key',
      MAIL_FROM: 'Maintenance <sender@example.test>',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
    });
    const config = new AppConfig(
      new ConfigService<Environment, true>(settings),
    );
    module = await Test.createTestingModule({
      imports: [
        MailModule.forRoot({
          transport: createMailTransport(config.mail),
          from: config.mail.from,
          retry: false,
        }),
      ],
    }).compile();
    await module.init();
    mailer = module.get(Mailer);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await module.close();
    vi.unstubAllGlobals();
  });

  it('sends plain-text notifications over HTTPS without SMTP configuration', async () => {
    expect(await mailer.send(message)).toMatchObject({
      accepted: ['recipient@example.test'],
      providerMessageId: '<brevo-id>',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        'api-key': 'test-api-key',
        'content-type': 'application/json',
      },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      sender: { name: 'Maintenance', email: 'sender@example.test' },
      to: [{ name: 'Recipient', email: 'recipient@example.test' }],
      subject: message.subject,
      textContent: message.text,
    });
  });

  it('preserves HTML, recipients, reply-to, headers and attachment bytes', async () => {
    await mailer.send({
      ...message,
      html: '<p>Assigned</p>',
      cc: 'cc@example.test',
      bcc: 'bcc@example.test',
      replyTo: 'Support <support@example.test>',
      headers: { 'X-Request-Reference': 'SR-PLUMB-42' },
      attachments: [{ filename: 'details.txt', content: 'repair details' }],
    });
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]!.body as string),
    ).toMatchObject({
      htmlContent: '<p>Assigned</p>',
      textContent: message.text,
      cc: [{ email: 'cc@example.test' }],
      bcc: [{ email: 'bcc@example.test' }],
      replyTo: { name: 'Support', email: 'support@example.test' },
      headers: { 'X-Request-Reference': 'SR-PLUMB-42' },
      attachment: [
        {
          name: 'details.txt',
          content: Buffer.from('repair details').toString('base64'),
        },
      ],
    });
  });

  it.each([
    [400, true],
    [401, true],
    [403, true],
    [408, false],
    [429, false],
    [500, false],
    [503, false],
  ])(
    'classifies HTTP %i failures as permanent=%s without exposing response data',
    async (status, permanent) => {
      fetchMock.mockResolvedValue(
        Response.json(
          { message: 'test-api-key sensitive-sign-in-link' },
          { status },
        ),
      );
      const error = await mailer
        .send(message)
        .catch((failure: unknown) => failure);
      expect(error).toMatchObject({
        provider: 'brevo',
        code: status,
        permanent,
      });
      expect(inspect(error)).not.toContain('test-api-key');
      expect(inspect(error)).not.toContain('sensitive-sign-in-link');
    },
  );

  it.each([
    ['2', 2000],
    ['Sat, 14 Nov 2026 12:00:05 GMT', 5000],
    ['invalid', undefined],
  ])('preserves Retry-After %s for the mailer', async (value, milliseconds) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    fetchMock.mockResolvedValue(
      new Response(null, { status: 429, headers: { 'retry-after': value } }),
    );
    const error: unknown = await mailer
      .send(message)
      .catch((failure: unknown) => failure);
    expect((error as { retryAfterMs?: number }).retryAfterMs).toBe(
      milliseconds,
    );
  });

  it('reports network failures as transient without logging fetch internals', async () => {
    fetchMock.mockRejectedValue(new Error('test-api-key'));
    const error = await mailer
      .send(message)
      .catch((failure: unknown) => failure);
    expect(error).toMatchObject({
      permanent: false,
      message: 'Brevo HTTPS request failed',
    });
    expect(inspect(error)).not.toContain('test-api-key');
  });

  it('aborts stalled requests after 30 seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => reject(init!.signal!.reason),
            { once: true },
          );
        }),
    );
    const pending = expect(mailer.send(message)).rejects.toMatchObject({
      phase: 'request',
      timeoutMs: 30_000,
      permanent: false,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
  });

  it('propagates caller cancellation', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => reject(init!.signal!.reason),
            { once: true },
          );
          controller.abort(new Error('Cancelled send'));
        }),
    );
    await expect(
      mailer.send({ ...message, signal: controller.signal }),
    ).rejects.toThrow('Cancelled send');
  });

  it('does not report acceptance for a malformed success response', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    await expect(mailer.send(message)).rejects.toMatchObject({
      permanent: false,
    });
  });

  it('rejects unsupported inline attachments before contacting Brevo', async () => {
    await expect(
      mailer.send({
        ...message,
        attachments: [
          { content: 'image', cid: 'logo', contentType: 'image/png' },
        ],
      }),
    ).rejects.toMatchObject({ permanent: true, field: 'attachments' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
