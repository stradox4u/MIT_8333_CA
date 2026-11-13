/** Synthetic settings only: applied before any Nest application imports. */
export const browserTestEnvironment = {
  NODE_ENV: 'test',
  PORT: '4174',
  APP_URL: 'http://127.0.0.1:5173',
  COOKIE_SECURE: 'false',
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'Browser fixture <fixture@example.test>',
  SMTP_URL: 'smtp://127.0.0.1:1025',
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  TRUST_PROXY_HOPS: '0',
  RATE_LIMIT_BY_IP: 'true',
  DEMO_ACCOUNTS_DOMAIN: 'browser.example.test',
  DEMO_ACCOUNTS_PASSWORD: '',
  OBSERVE_APP_KEY: '',
  OBSERVE_APP_SECRET: '',
};
