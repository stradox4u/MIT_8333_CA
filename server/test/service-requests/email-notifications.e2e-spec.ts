import { Logger } from '@nestjs/common';
import { MailError } from '@nestjs/mail';
import { sql } from 'drizzle-orm';
import {
  assign,
  aServiceRequest,
  idOf,
  requestInStatus,
  submitServiceRequest,
} from '../support/service-requests.js';
import {
  type Browser,
  createTestApp,
  type TestApp,
} from '../support/test-app.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

const TRACKING = 'http://localhost:5173/requests/';
const DAY = 24 * 60 * 60 * 1000;

describe('Email notifications for Service Requests', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  /** Every mail sent, once the notifications in flight have gone. */
  const allMail = async () => {
    await app.notificationsSent();
    return app.mailbox.mails;
  };

  /** The notifications `email` received: mail naming a Reference, oldest first. */
  const notificationsTo = async (email: string) => {
    await app.notificationsSent();
    return app.mailbox
      .filter({ to: email })
      .filter(({ subject }) => /\bSR-[A-Z]+-\d+\b/.test(subject));
  };

  /** The one notification `email` received about `reference`. */
  const onlyNotificationTo = async (email: string, reference: string) => {
    const mails = await notificationsTo(email);
    expect(mails.map(({ subject }) => subject)).toHaveLength(1);
    expect(mails[0].subject).toContain(reference);
    expect(mails[0].link(TRACKING).href).toBe(TRACKING + reference);
    return mails[0];
  };

  describe('a new Submitted request', () => {
    it('uses current Administrator roles when a request is handed back', async () => {
      const work = await requestInStatus(app, 'assigned');
      const previous = await app.signInAsAdministrator('previous@example.com');
      const next = await app.signUp('next@example.com');
      await work.admin
        .patch(`/api/users/${await idOf(previous)}/role`)
        .send({ role: 'staff' })
        .expect(200);
      await work.admin
        .patch(`/api/users/${await idOf(next)}/role`)
        .send({ role: 'administrator' })
        .expect(200);
      await app.notificationsSent();
      app.mailbox.clear();

      await work.admin
        .delete(`/api/service-requests/${work.reference}/assignment`)
        .expect(200);

      await onlyNotificationTo('next@example.com', work.reference);
      expect(await notificationsTo('previous@example.com')).toEqual([]);
      expect(await notificationsTo('admin@example.com')).toEqual([]);
    });

    it('keeps untrusted content as plain text and sends each recipient privately', async () => {
      const requester = await app.signUp('ada@example.com');
      await app.signInAsAdministrator('grace@example.com');
      await app.signInAsAdministrator('alan@example.com');
      await app.notificationsSent();
      app.mailbox.clear();

      const reference = await submitServiceRequest(
        requester,
        aServiceRequest({
          title: '<img src=x onerror=alert(1)>',
          location: 'Hall <script>alert(1)</script> & Annex',
          description: 'Private narrative that the notification must not copy.',
        }),
      );

      for (const email of ['grace@example.com', 'alan@example.com']) {
        const mail = await onlyNotificationTo(email, reference);
        expect(mail.html).toBeUndefined();
        expect(mail.text).toContain('<img src=x onerror=alert(1)>');
        expect(mail.text).toContain('Hall <script>alert(1)</script> & Annex');
        expect(mail.text).not.toContain('Private narrative');
        expect(mail.text).not.toContain('Priority');
        expect(mail.to.map(({ address }) => address)).toEqual([email]);
        expect(mail.cc).toEqual([]);
        expect(mail.bcc).toEqual([]);
      }
    });

    it('emails every active Administrator, but not the Requester', async () => {
      const ada = await app.signUp('ada@example.com');
      await app.signInAsAdministrator('grace@example.com');
      await app.signInAsAdministrator('alan@example.com');
      await app.notificationsSent();
      app.mailbox.clear();

      const reference = await submitServiceRequest(ada);

      for (const admin of ['grace@example.com', 'alan@example.com']) {
        const mail = await onlyNotificationTo(admin, reference);
        expect(mail.subject).toBe(`${reference}: a new Service Request`);
        expect(mail.text).toContain('Leaking tap');
        expect(mail.text).toContain('Block C, ground floor toilets');
        expect(mail.text).toContain('waiting for an Assignment');
      }
      expect(await notificationsTo('ada@example.com')).toEqual([]);
    });

    it('skips the Administrator who submitted it, and Deactivated, Erased and invited ones', async () => {
      const grace = await app.signInAsAdministrator('grace@example.com');
      const alan = await app.signInAsAdministrator('alan@example.com');
      const barbara = await app.signInAsAdministrator('barbara@example.com');
      await app.signInAsAdministrator('linus@example.com');
      await grace.post(`/api/users/${await idOf(alan)}/deactivate`).expect(200);
      await grace.post(`/api/users/${await idOf(barbara)}/erase`).expect(200);
      await grace
        .post('/api/users')
        .send({
          email: 'invited@example.com',
          firstName: 'Ida',
          lastName: 'Invited',
          role: 'administrator',
        })
        .expect(201);
      await app.notificationsSent();
      app.mailbox.clear();

      const reference = await submitServiceRequest(grace);

      await onlyNotificationTo('linus@example.com', reference);
      for (const skipped of [
        'grace@example.com',
        'alan@example.com',
        'barbara@example.com',
        'invited@example.com',
      ]) {
        expect(await notificationsTo(skipped)).toEqual([]);
      }
    });
  });

  describe('the Requester', () => {
    const requester = 'requester@example.com';

    it('hears when an Administrator gives the request an Assignment', async () => {
      const work = await requestInStatus(app, 'submitted');
      await app.notificationsSent();
      app.mailbox.clear();

      await assign(work.admin, work.reference, work.officerId);

      const mail = await onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Assigned`);
      expect(mail.text).toContain('Leaking tap');
    });

    it('hears when its officer starts the work', async () => {
      const work = await requestInStatus(app, 'assigned');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.officer
        .post(`/api/service-requests/${work.reference}/start`)
        .expect(200);

      const mail = await onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is In Progress`);
      expect(await notificationsTo('officer@example.com')).toEqual([]);
    });

    it('hears when the work is Completed, with the link to answer Fixed or Not fixed', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.officer
        .post(`/api/service-requests/${work.reference}/complete`)
        .send({ note: 'Replaced the washer.' })
        .expect(200);

      const mail = await onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Completed`);
      expect(mail.text).toContain('Replaced the washer.');
      expect(mail.text).toContain('Fixed or Not fixed');
      expect(mail.text).toContain('7 days');
    });

    it('hears when an Administrator verifies it', async () => {
      const work = await requestInStatus(app, 'completed');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.admin
        .post(`/api/service-requests/${work.reference}/verify`)
        .expect(200);

      const mail = await onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Verified`);
      expect(mail.text).toContain(
        'an Administrator confirmed the fault is fixed',
      );
      expect(await notificationsTo('officer@example.com')).toEqual([]);
    });

    it('hears when the daily job verifies it after 7 days', async () => {
      const work = await requestInStatus(app, 'completed');
      await app.notificationsSent();
      app.mailbox.clear();
      app.clock.advance(7 * DAY);

      await app.runDailyCleanup();

      const mail = await onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Verified`);
      expect(mail.text).toContain('automatically');
    });

    it('hears when an Administrator cancels it, with the reason', async () => {
      const work = await requestInStatus(app, 'submitted');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.admin
        .post(`/api/service-requests/${work.reference}/cancel`)
        .send({ reason: 'Reported twice.' })
        .expect(200);

      const mail = await onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Cancelled`);
      expect(mail.text).toContain('Reported twice.');
    });

    it('isn’t emailed about their own verification or cancellation', async () => {
      const completed = await requestInStatus(app, 'completed');
      const submitted = await submitServiceRequest(completed.requester);
      await app.notificationsSent();
      app.mailbox.clear();

      await completed.requester
        .post(`/api/service-requests/${completed.reference}/verify`)
        .expect(200);
      await completed.requester
        .post(`/api/service-requests/${submitted}/cancel`)
        .send({ reason: 'Fixed itself.' })
        .expect(200);

      expect(await allMail()).toEqual([]);
    });

    it('isn’t emailed about Progress Notes, Priority or corrected details', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.officer
        .post(`/api/service-requests/${work.reference}/progress-notes`)
        .send({ text: 'Waiting for a replacement part.' })
        .expect(201);
      await work.admin
        .put(`/api/service-requests/${work.reference}/priority`)
        .send({ priority: 'urgent' })
        .expect(200);
      await work.admin
        .patch(`/api/service-requests/${work.reference}`)
        .send({ location: 'Block C, first floor toilets' })
        .expect(200);

      expect(await allMail()).toEqual([]);
    });

    it('gets nothing once Deactivated or Erased', async () => {
      const deactivated = await requestInStatus(app, 'submitted');
      await deactivated.admin
        .post(`/api/users/${deactivated.requesterId}/deactivate`)
        .expect(200);
      const ada = await app.signUp('ada@example.com');
      const erased = await submitServiceRequest(ada);
      await ada.delete('/api/me').expect(204);
      await app.notificationsSent();
      app.mailbox.clear();

      for (const reference of [deactivated.reference, erased]) {
        await deactivated.admin
          .post(`/api/service-requests/${reference}/cancel`)
          .send({ reason: 'Reported twice.' })
          .expect(200);
      }

      expect(await notificationsTo(requester)).toEqual([]);
      expect(await notificationsTo('ada@example.com')).toEqual([]);
    });
  });

  describe('the Maintenance Officer', () => {
    const officer = 'officer@example.com';

    it('hears when they’re given an Assignment, with its Priority', async () => {
      const work = await requestInStatus(app, 'submitted');
      await work.admin
        .put(`/api/service-requests/${work.reference}/priority`)
        .send({ priority: 'urgent' })
        .expect(200);
      await app.notificationsSent();
      app.mailbox.clear();

      await assign(work.admin, work.reference, work.officerId);

      const mail = await onlyNotificationTo(officer, work.reference);
      expect(mail.subject).toBe(`${work.reference}: a new Assignment`);
      expect(mail.text).toContain('Leaking tap');
      expect(mail.text).toContain('Block C, ground floor toilets');
      expect(mail.text).toContain('Urgent');
      expect(await notificationsTo('admin@example.com')).toEqual([]);
    });

    it('hears when it’s reassigned, while the new officer hears they have it', async () => {
      const work = await requestInStatus(app, 'assigned');
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      await app.notificationsSent();
      app.mailbox.clear();

      await assign(work.admin, work.reference, await idOf(ngozi));

      const ended = await onlyNotificationTo(officer, work.reference);
      expect(ended.subject).toBe(
        `${work.reference}: your Assignment has ended`,
      );
      expect(ended.text).toContain('another Maintenance Officer');
      expect(
        (await onlyNotificationTo('ngozi@example.com', work.reference)).subject,
      ).toBe(`${work.reference}: a new Assignment`);
      // Still Assigned, so the Requester has no Status Update to hear about.
      expect(await notificationsTo('requester@example.com')).toEqual([]);
    });

    it('lets the Requester hear when In Progress work is reassigned', async () => {
      const work = await requestInStatus(app, 'in_progress');
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      await app.notificationsSent();
      app.mailbox.clear();

      await assign(work.admin, work.reference, await idOf(ngozi));

      expect(
        (await onlyNotificationTo('requester@example.com', work.reference))
          .subject,
      ).toBe(`${work.reference} is Assigned`);
    });

    it('hears when it’s unassigned, as the Requester and other Administrators hear it’s Submitted again', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.signInAsAdministrator('alan@example.com');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.admin
        .delete(`/api/service-requests/${work.reference}/assignment`)
        .expect(200);

      const ended = await onlyNotificationTo(officer, work.reference);
      expect(ended.subject).toBe(
        `${work.reference}: your Assignment has ended`,
      );
      expect(ended.text).toContain('unassigned');
      expect(
        (await onlyNotificationTo('requester@example.com', work.reference))
          .subject,
      ).toBe(`${work.reference} is Submitted again`);
      const queued = await onlyNotificationTo(
        'alan@example.com',
        work.reference,
      );
      expect(queued.subject).toBe(`${work.reference} is Submitted again`);
      expect(queued.text).toContain('unassigned');
      expect(queued.text).toContain('waiting for an Assignment');
      expect(await notificationsTo('admin@example.com')).toEqual([]);
    });

    it('hears when an Administrator cancels their work, with the reason', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.admin
        .post(`/api/service-requests/${work.reference}/cancel`)
        .send({ reason: 'The block is being demolished.' })
        .expect(200);

      const ended = await onlyNotificationTo(officer, work.reference);
      expect(ended.subject).toBe(
        `${work.reference}: your Assignment has ended`,
      );
      expect(ended.text).toContain('Cancelled');
      expect(ended.text).toContain('The block is being demolished.');
      expect(
        (await onlyNotificationTo('requester@example.com', work.reference))
          .subject,
      ).toBe(`${work.reference} is Cancelled`);
    });

    it('hears when the Requester answers Not fixed, with the reason', async () => {
      const work = await requestInStatus(app, 'completed');
      await app.notificationsSent();
      app.mailbox.clear();

      await work.requester
        .post(`/api/service-requests/${work.reference}/not-fixed`)
        .send({ reason: 'It still drips.' })
        .expect(200);

      const mail = await onlyNotificationTo(officer, work.reference);
      expect(mail.subject).toBe(`${work.reference}: answered Not fixed`);
      expect(mail.text).toContain('It still drips.');
      expect(mail.text).toContain('Assigned');
      expect(await notificationsTo('requester@example.com')).toEqual([]);
      expect(await notificationsTo('admin@example.com')).toEqual([]);
    });

    it.each([
      ['deactivated', { path: 'deactivate', body: undefined }],
      ['erased', { path: 'erase', body: undefined }],
      ['demoted', { path: 'role', body: { role: 'staff' } }],
    ] as const)(
      'is replaced by every active Administrator when Not fixed comes back after they’re %s',
      async (_, leaving) => {
        const work = await requestInStatus(app, 'completed');
        const left = leaving.body
          ? work.admin.patch(`/api/users/${work.officerId}/${leaving.path}`)
          : work.admin.post(`/api/users/${work.officerId}/${leaving.path}`);
        await left.send(leaving.body).expect(200);
        await app.notificationsSent();
        app.mailbox.clear();

        await work.requester
          .post(`/api/service-requests/${work.reference}/not-fixed`)
          .send({ reason: 'It still drips.' })
          .expect(200);

        const queued = await onlyNotificationTo(
          'admin@example.com',
          work.reference,
        );
        expect(queued.subject).toBe(`${work.reference} is Submitted again`);
        expect(queued.text).toContain('Not fixed');
        expect(queued.text).toContain('It still drips.');
        expect(await notificationsTo(officer)).toEqual([]);
        expect(await notificationsTo('requester@example.com')).toEqual([]);
      },
    );

    it('gets one email when they’re also the Requester', async () => {
      const admin = await app.signInAsAdministrator();
      const chinedu = await app.signInAsMaintenanceOfficer();
      const reference = await submitServiceRequest(chinedu);
      await app.notificationsSent();
      app.mailbox.clear();

      await assign(admin, reference, await idOf(chinedu));

      const mail = await onlyNotificationTo(officer, reference);
      expect(mail.subject).toBe(`${reference}: a new Assignment`);
      expect(mail.text).toContain(`Your Service Request ${reference}`);
    });
  });

  describe('a Maintenance Officer leaving', () => {
    /** Chinedu holds Ada's Assigned, In Progress and Completed requests. */
    const anOfficerWithWork = async () => {
      const ada = await app.signUp('ada@example.com');
      const admin = await app.signInAsAdministrator('grace@example.com');
      await app.signInAsAdministrator('alan@example.com');
      const officer = await app.signInAsMaintenanceOfficer(
        'chinedu@example.com',
      );
      const officerId = await idOf(officer);
      const open = [
        await submitServiceRequest(ada),
        await submitServiceRequest(ada),
      ];
      const completed = await submitServiceRequest(ada);
      for (const reference of [...open, completed]) {
        await assign(admin, reference, officerId);
      }
      for (const reference of [open[1], completed]) {
        await officer
          .post(`/api/service-requests/${reference}/start`)
          .expect(200);
      }
      await officer
        .post(`/api/service-requests/${completed}/complete`)
        .expect(200);
      await app.notificationsSent();
      app.mailbox.clear();
      return { admin, officer, officerId, open, completed };
    };

    const subjectsTo = async (email: string) =>
      (await notificationsTo(email)).map(({ subject }) => subject).sort();

    it('emails the Requester and the other Administrators once per handed-back request', async () => {
      const work = await anOfficerWithWork();

      await work.admin
        .post(`/api/users/${work.officerId}/deactivate`)
        .expect(200);

      const handedBack = work.open
        .map((reference) => `${reference} is Submitted again`)
        .sort();
      expect(await subjectsTo('ada@example.com')).toEqual(handedBack);
      expect(await subjectsTo('alan@example.com')).toEqual(handedBack);
      for (const mail of await notificationsTo('alan@example.com')) {
        expect(mail.text).toContain('no longer available');
      }
      expect(await subjectsTo('grace@example.com')).toEqual([]);
      expect(await subjectsTo('chinedu@example.com')).toEqual([]);
    });

    it('tells a demoted officer each Assignment has ended', async () => {
      const work = await anOfficerWithWork();

      await work.admin
        .patch(`/api/users/${work.officerId}/role`)
        .send({ role: 'staff' })
        .expect(200);

      expect(await subjectsTo('chinedu@example.com')).toEqual(
        work.open
          .map((reference) => `${reference}: your Assignment has ended`)
          .sort(),
      );
      expect((await notificationsTo('chinedu@example.com'))[0].text).toContain(
        'no longer a Maintenance Officer',
      );
    });

    it('emails every Administrator when the officer erases themselves', async () => {
      const work = await anOfficerWithWork();

      await work.officer.delete('/api/me').expect(204);

      for (const admin of ['grace@example.com', 'alan@example.com']) {
        expect(await subjectsTo(admin)).toHaveLength(2);
      }
    });
  });

  describe('mail trouble', () => {
    afterEach(() => vi.restoreAllMocks());

    const permanentFailure = () =>
      new MailError('Mailbox unavailable', { permanent: true, code: 550 });

    it('logs a failed send, while the change stands and everyone else is emailed', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.notificationsSent();
      app.mailbox.clear();
      const logged = vi.spyOn(Logger.prototype, 'error');
      app.mailbox.failNext(permanentFailure());

      await work.admin
        .post(`/api/service-requests/${work.reference}/cancel`)
        .send({ reason: 'Reported twice.' })
        .expect(200);

      const shown = await work.admin
        .get(`/api/service-requests/${work.reference}`)
        .expect(200);
      expect(shown.body.status).toBe('cancelled');
      const delivered = [
        ...(await notificationsTo('officer@example.com')),
        ...(await notificationsTo('requester@example.com')),
      ];
      expect(delivered).toHaveLength(1);
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining(work.reference),
        expect.any(MailError),
      );
    });

    it('keeps an officer’s departure when one of its emails fails', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.signInAsAdministrator('alan@example.com');
      await app.notificationsSent();
      app.mailbox.clear();
      app.mailbox.failNext(permanentFailure());

      await work.admin
        .post(`/api/users/${work.officerId}/deactivate`)
        .expect(200);

      const shown = await work.admin
        .get(`/api/service-requests/${work.reference}`)
        .expect(200);
      expect(shown.body.status).toBe('submitted');
      const delivered = [
        ...(await notificationsTo('requester@example.com')),
        ...(await notificationsTo('alan@example.com')),
      ];
      expect(delivered).toHaveLength(1);
    });

    it.each(['cancel', 'deactivate'] as const)(
      'doesn’t hold up %s while the mail server is slow',
      async (action) => {
        const work = await requestInStatus(app, 'in_progress');
        await app.notificationsSent();
        app.mailbox.clear();
        let release = () => {};
        const stalled = new Promise<void>((resolve) => (release = resolve));
        const deliver = app.mailbox.send.bind(app.mailbox);
        vi.spyOn(app.mailbox, 'send').mockImplementation(async (message) => {
          await stalled;
          return deliver(message);
        });

        try {
          await (
            action === 'cancel'
              ? work.admin
                  .post(`/api/service-requests/${work.reference}/cancel`)
                  .send({ reason: 'Reported twice.' })
              : work.admin.post(`/api/users/${work.officerId}/deactivate`)
          )
            .timeout(2_000)
            .expect(200);
        } finally {
          release();
        }

        await onlyNotificationTo('requester@example.com', work.reference);
      },
    );
  });
});

describe('Email notifications when a change rolls back', () => {
  let app: TestApp;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = await createTestApp({ database });
    // Fails the commit itself, after every statement in the change succeeded.
    for (const statement of [
      `create function refuse_at_commit() returns trigger language plpgsql as $$
       begin
         raise exception 'refused at commit';
       end $$`,
      `create constraint trigger refuse_cancelling after insert on status_updates
       deferrable initially deferred for each row
       when (new.to_status = 'cancelled') execute function refuse_at_commit()`,
      `create constraint trigger refuse_officers_leaving after insert on activity_log
       deferrable initially deferred for each row
       when (new.action = 'officer_left') execute function refuse_at_commit()`,
    ]) {
      await database.db.execute(sql.raw(statement));
    }
  });
  beforeEach(() => app.reset());
  afterAll(() => app.close());

  it('sends nothing for a Status Update that never commits', async () => {
    const work = await requestInStatus(app, 'in_progress');
    await app.notificationsSent();
    app.mailbox.clear();

    await work.admin
      .post(`/api/service-requests/${work.reference}/cancel`)
      .send({ reason: 'Reported twice.' })
      .expect(500);

    await app.notificationsSent();
    expect(app.mailbox.mails).toEqual([]);
    const shown = await work.admin
      .get(`/api/service-requests/${work.reference}`)
      .expect(200);
    expect(shown.body.status).toBe('in_progress');
  });

  it.each([
    [
      'deactivated',
      (admin: Browser, id: string) => admin.post(`/api/users/${id}/deactivate`),
    ],
    [
      'erased',
      (admin: Browser, id: string) => admin.post(`/api/users/${id}/erase`),
    ],
    [
      'demoted',
      (admin: Browser, id: string) =>
        admin.patch(`/api/users/${id}/role`).send({ role: 'staff' }),
    ],
  ] as const)(
    'sends nothing when an officer being %s never commits',
    async (_, leave) => {
      const work = await requestInStatus(app, 'in_progress');
      await app.signInAsAdministrator('alan@example.com');
      await app.notificationsSent();
      app.mailbox.clear();

      await leave(work.admin, work.officerId).expect(500);

      await app.notificationsSent();
      expect(app.mailbox.mails).toEqual([]);
      const shown = await work.admin
        .get(`/api/service-requests/${work.reference}`)
        .expect(200);
      expect(shown.body.status).toBe('in_progress');
    },
  );
});
