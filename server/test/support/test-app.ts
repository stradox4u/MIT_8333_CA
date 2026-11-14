import {
  InMemoryDisk,
  STORAGE_MODULE_OPTIONS,
  receiveSignedUpload,
  serveSignedUrl,
} from '@nestjs/storage';
import type { Request, Response } from 'express';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
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
import { DemoServiceRequests } from '../../src/service-requests/demo-service-requests.js';
import { ServiceRequestNotifications } from '../../src/service-requests/service-request-notifications.js';
import { UsersRepository } from '../../src/users/users.repository.js';
import { FakeGoogle, type GoogleAccount } from './fake-google.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

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

/** A test client that keeps its cookies, like a browser. */
export type Browser = ReturnType<TestApp['browser']>;

/**
 * The whole application over HTTP, with the three system boundaries
 * replaced: an in-process database, a mailbox that keeps what is sent, and a
 * clock the test controls.
 */
export async function createTestApp({
  config = {},
  port = 0,
  database: suppliedDatabase,
}: {
  /** Settings to override, by `AppConfig` property, for this file's app. */
  config?: Partial<AppConfig>;
  /** Browser journeys use a stable port; ordinary tests keep a free one. */
  port?: number;
  /** Concurrency suites supply an isolated real Postgres database. */
  database?: TestDatabase;
} = {}) {
  const database = suppliedDatabase ?? (await createTestDatabase());
  const mailbox = new InMemoryMailTransport();
  const clock = new TestClock();
  const google = new FakeGoogle(() => clock.now());

  const photoDisk = new InMemoryDisk({
    signedUrls: {
      baseUrl: 'http://storage.example.test/__test/photos',
      keys: ['synthetic-photo-signing-key-for-tests-only'],
    },
  });

  let app: INestApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_MODULE_OPTIONS)
      .useValue({ default: 'photos', disks: { photos: photoDisk } })
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
              Object.hasOwn(config, name)
                ? config[name as keyof AppConfig]
                : Reflect.get(real, name, receiver),
          }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use('/__test/photos', async (req: Request, res: Response) => {
      try {
        if (req.method === 'PUT') {
          await receiveSignedUpload(photoDisk, { req, res });
          res.status(200).end();
        } else {
          const file = await serveSignedUrl(photoDisk, { req, res });
          if (file) file.getStream().pipe(res);
          else res.end();
        }
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'getStatus' in error
            ? (error as { getStatus(): number }).getStatus()
            : 500;
        res.status(status).end();
      }
    });
    configureApp(app);
    // Listen once: otherwise supertest opens a new port for every request.
    await app.listen(port, '127.0.0.1');
  } catch (error) {
    try {
      await app?.close();
    } finally {
      await database.close();
    }
    throw error;
  }

  /** Waits for Service Request emails sent in the background after a change. */
  const notificationsSent = () =>
    app.get(ServiceRequestNotifications).settled();

  /** The latest mail sent to `email`, waiting briefly for it to arrive. */
  const latestMailTo = async (email: string) => {
    await notificationsSent();
    const deadline = Date.now() + 1_000;
    do {
      const mail = mailbox.find({ to: email });
      if (mail) return mail;
      await delay(10);
    } while (Date.now() < deadline);
    throw new Error(`No mail sent to ${email}`);
  };

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
   * A new browser, signed in as an active Maintenance Officer: created as an
   * Administrator's Invitation creates one, then signed in once.
   */
  const signInAsMaintenanceOfficer = async (
    email = 'officer@example.com',
    { firstName = 'Chinedu', lastName = 'Eze' } = {},
  ) => {
    await app.get(UsersRepository).createUser({
      email,
      firstName,
      lastName,
      roleId: 'maintenance_officer',
    });
    return signInByLink(email);
  };

  /** The browser that started sign-in visits this fake Google callback. */
  const googleCallbackFor = (
    authorizationUrl: string,
    account: GoogleAccount,
  ) => {
    const authorization = new URL(authorizationUrl);
    const nonce = authorization.searchParams.get('nonce');
    const state = authorization.searchParams.get('state');
    if (
      authorization.origin !== 'https://accounts.google.com' ||
      !nonce ||
      !state
    ) {
      throw new Error(
        'Expected a Google authorization URL with nonce and state',
      );
    }
    const callback = new URL(
      '/api/auth/oidc/google/callback',
      app.get(AppConfig).appUrl,
    );
    callback.searchParams.set('code', google.approve(account, nonce));
    callback.searchParams.set('state', state);
    return callback.href;
  };

  /** Walks a test client through the real Google start and callback routes. */
  const continueWithGoogle = async (
    signingIn: ReturnType<typeof browser>,
    account: GoogleAccount,
    {
      keepSignedIn = false,
      redirectTo,
    }: {
      keepSignedIn?: boolean;
      redirectTo?: string;
    } = {},
  ) => {
    const login = await signingIn
      .get('/api/auth/oidc/google/login')
      .query({ keepSignedIn, ...(redirectTo && { redirectTo }) })
      .expect(302);
    const callback = new URL(
      googleCallbackFor(login.headers.location, account),
    );
    return signingIn.get(callback.pathname + callback.search);
  };

  return {
    mailbox,
    photoDisk,
    clock,
    googleFetch: app.get(GoogleFetch),
    googleCallbackFor,
    url: await app.getUrl(),
    continueWithGoogle,
    /** What the scheduler runs once a day. */
    runDailyCleanup: () => app.get(DailyCleanup).run(),
    /** What `npm run db:seed` does, with the given settings. */
    seedDemoAccounts: async (settings: AppConfig['demoAccounts']) => {
      await app.get(DemoAccounts).seed(settings);
      await app.get(DemoServiceRequests).seed(settings.domain);
    },
    browser,
    notificationsSent,
    latestMailTo,
    signInLinkTokenSentTo,
    signInByLink,
    signUp,
    signInAsAdministrator,
    signInAsMaintenanceOfficer,
    databaseMentions: (text: string) => database.mentions(text),
    async reset() {
      await notificationsSent();
      mailbox.clear();
      photoDisk.clear();
      clock.reset();
      google.reset();
      await database.reset();
    },
    async close() {
      try {
        await notificationsSent();
        await app.close();
      } finally {
        await database.close();
      }
    },
  };
}
