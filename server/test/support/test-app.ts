import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { Clock } from '../../src/clock.js';
import { configureApp } from '../../src/configure-app.js';
import { GoogleFetch } from '../../src/auth/google-fetch.js';
import { DailyCleanup } from '../../src/cleanup/daily-cleanup.js';
import { AppConfig } from '../../src/config/app-config.js';
import type { Environment } from '../../src/config/environment.js';
import { DATABASE } from '../../src/database/database.js';
import { DemoAccounts } from '../../src/users/demo-accounts.js';
import { UsersRepository } from '../../src/users/users.repository.js';
import { FakeGoogle, type GoogleAccount } from './fake-google.js';
import { createTestDatabase } from './test-database.js';

/** Every test starts at this instant. */
export const TEST_START = Date.parse('2026-11-12T09:00:00.000Z');

/** A clock the tests move by hand, shared by the app and the auth package. */
export class TestClock extends Clock {
  private current = TEST_START;

  now() {
    return this.current;
  }

  advance(milliseconds: number) {
    this.current += milliseconds;
  }

  reset() {
    this.current = TEST_START;
  }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * The whole application over HTTP, with the three system boundaries
 * replaced: an in-process database, a mailbox that keeps what is sent, and a
 * clock the test controls.
 */
export async function createTestApp({
  config = {},
}: {
  /** Settings to override, by `AppConfig` property, for this file's app. */
  config?: Partial<Record<keyof AppConfig, unknown>>;
} = {}) {
  const database = await createTestDatabase();
  const mailbox = new InMemoryMailTransport();
  const clock = new TestClock();
  const google = new FakeGoogle(() => clock.now());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE)
    .useValue(database.db)
    .overrideProvider(MailTransport)
    .useValue(mailbox)
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(GoogleFetch)
    .useValue({ fetch: google.fetch })
    .overrideProvider(AppConfig)
    .useFactory({
      inject: [ConfigService],
      factory: (settings: ConfigService<Environment, true>) =>
        new Proxy(new AppConfig(settings), {
          get: (real, name, receiver) =>
            name in config
              ? config[name as keyof AppConfig]
              : Reflect.get(real, name, receiver),
        }),
    })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  // Listen once on a free port: without it, supertest opens and closes a new
  // port for every request, which can collide across parallel test files.
  await app.listen(0, '127.0.0.1');

  /** The latest mail sent to `email`, waiting briefly for it to arrive. */
  const latestMailTo = (email: string) =>
    vi.waitFor(() => {
      const mail = mailbox.filter({ to: email }).at(-1);
      if (!mail) {
        throw new Error(`No mail sent to ${email}`);
      }
      return mail;
    });

  /** A client that keeps its cookies between requests, like a browser. */
  const browser = () => request.agent(app.getHttpServer());

  const signInLinkTokenSentTo = async (email: string) => {
    const mail = await latestMailTo(email);
    return mail.link(/token=/).searchParams.get('token');
  };

  /** A new browser, signed in by requesting and using a Sign-in Link. */
  const signInByLink = async (
    email: string,
    {
      keepSignedIn = false,
      userAgent = 'Test Browser',
    }: { keepSignedIn?: boolean; userAgent?: string } = {},
  ) => {
    const signedIn = browser().set('User-Agent', userAgent);
    await signedIn
      .post('/api/auth/sign-in-link')
      .send({ email, keepSignedIn })
      .expect(202);
    const token = await signInLinkTokenSentTo(email);
    await signedIn
      .post('/api/auth/sign-in-link/consume')
      .send({ token })
      .expect(200);
    return signedIn;
  };

  /** A new browser, signed in as a User who has just finished sign-up. */
  const signUp = async (
    email: string,
    {
      firstName = 'Ada',
      lastName = 'Lovelace',
      role = 'student',
    }: { firstName?: string; lastName?: string; role?: string } = {},
  ) => {
    const signedIn = await signInByLink(email);
    await signedIn
      .post('/api/auth/sign-up/complete')
      .send({ firstName, lastName, role })
      .expect(200);
    return signedIn;
  };

  /**
   * A new browser, signed in as an Administrator. The only public way to get
   * one is the seed, so the account is created as the seed creates it.
   */
  const signInAsAdministrator = async (email = 'admin@example.com') => {
    await app.get(UsersRepository).createUser({
      email,
      firstName: 'Grace',
      lastName: 'Hopper',
      roleId: 'administrator',
    });
    return signInByLink(email);
  };

  /**
   * Walks `signingIn` through "Continue with Google": the app's redirect to
   * Google, Google approving `account`, and the callback. Resolves to the
   * callback's response.
   */
  const continueWithGoogle = async (
    signingIn: ReturnType<typeof browser>,
    account: GoogleAccount,
    { keepSignedIn = false }: { keepSignedIn?: boolean } = {},
  ) => {
    const login = await signingIn
      .get(`/api/auth/oidc/google/login?keepSignedIn=${keepSignedIn}`)
      .expect(302);
    const authorization = new URL(login.headers.location);
    const code = google.approve(
      account,
      authorization.searchParams.get('nonce')!,
    );
    const callback = new URL('/api/auth/oidc/google/callback', 'http://x');
    callback.searchParams.set('code', code);
    callback.searchParams.set(
      'state',
      authorization.searchParams.get('state')!,
    );
    return signingIn.get(callback.pathname + callback.search);
  };

  return {
    mailbox,
    clock,
    continueWithGoogle,
    /** What the scheduler runs once a day. */
    runDailyCleanup: () => app.get(DailyCleanup).run(),
    /** What `npm run db:seed` does, with the given settings. */
    seedDemoAccounts: (settings: AppConfig['demoAccounts']) =>
      app.get(DemoAccounts).seed(settings),
    browser,
    latestMailTo,
    signInLinkTokenSentTo,
    signInByLink,
    signUp,
    signInAsAdministrator,
    databaseMentions: (text: string) => database.mentions(text),
    async reset() {
      mailbox.clear();
      clock.reset();
      await database.reset();
    },
    async close() {
      await app.close();
      await database.close();
    },
  };
}
