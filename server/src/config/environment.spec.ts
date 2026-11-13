import { environment } from './environment.js';

const REQUIRED = {
  APP_URL: 'https://mit8333.netlify.app',
  DATABASE_URL: 'postgres://user:secret@db.railway.internal:5432/app',
  SMTP_URL: 'smtp://login:key@smtp-relay.brevo.com:587',
  MAIL_FROM: 'MIT 8333 Maintenance <no-reply@example.com>',
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
};

describe('the environment', () => {
  it('accepts the required variables and fills in the defaults', () => {
    expect(environment.parse(REQUIRED)).toMatchObject({
      PORT: 3000,
      MAIL_TRANSPORT: 'smtp',
      TRUST_PROXY_HOPS: 0,
      RATE_LIMIT_BY_IP: true,
      COOKIE_SECURE: true,
    });
  });

  it.each(Object.keys(REQUIRED))('refuses to start without %s', (name) => {
    const { [name]: _, ...missing } = REQUIRED as Record<string, string>;

    expect(environment.safeParse(missing).success).toBe(false);
  });

  it('turns flags and numbers given as text into values', () => {
    expect(
      environment.parse({
        ...REQUIRED,
        PORT: '8080',
        TRUST_PROXY_HOPS: '2',
        RATE_LIMIT_BY_IP: 'false',
        COOKIE_SECURE: 'false',
      }),
    ).toMatchObject({
      PORT: 8080,
      TRUST_PROXY_HOPS: 2,
      RATE_LIMIT_BY_IP: false,
      COOKIE_SECURE: false,
    });
  });

  it.each(['required', 'opportunistic'])(
    'accepts the explicit SMTP STARTTLS policy %s',
    (policy) => {
      expect(
        environment.parse({ ...REQUIRED, SMTP_STARTTLS: policy }).SMTP_STARTTLS,
      ).toBe(policy);
    },
  );

  it.each([
    ['APP_URL', 'not a url'],
    ['MAIL_TRANSPORT', 'carrier-pigeon'],
    ['SMTP_STARTTLS', 'never'],
    ['COOKIE_SECURE', 'maybe'],
    ['TRUST_PROXY_HOPS', '-1'],
  ])('refuses %s=%s', (name, value) => {
    expect(environment.safeParse({ ...REQUIRED, [name]: value }).success).toBe(
      false,
    );
  });
});
