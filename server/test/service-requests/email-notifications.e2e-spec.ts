import { Logger } from '@nestjs/common';
import { MailError } from '@nestjs/mail';
import { sql } from 'drizzle-orm';
import {
  assign,
  idOf,
  requestInStatus,
  submitServiceRequest,
} from '../support/service-requests.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
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

  /** The notifications `email` received: mail naming a Reference, oldest first. */
  const notificationsTo = (email: string) =>
    app.mailbox
      .filter({ to: email })
      .filter(({ subject }) => /\bSR-[A-Z]+-\d+\b/.test(subject));

  /** The one notification `email` received about `reference`. */
  const onlyNotificationTo = (email: string, reference: string) => {
    const mails = notificationsTo(email);
    expect(mails.map(({ subject }) => subject)).toHaveLength(1);
    expect(mails[0].subject).toContain(reference);
    expect(mails[0].link(TRACKING).href).toBe(TRACKING + reference);
    return mails[0];
  };

  describe('a new Submitted request', () => {
    it('emails every active Administrator, but not the Requester', async () => {
      const ada = await app.signUp('ada@example.com');
      await app.signInAsAdministrator('grace@example.com');
      await app.signInAsAdministrator('alan@example.com');
      app.mailbox.clear();

      const reference = await submitServiceRequest(ada);

      for (const admin of ['grace@example.com', 'alan@example.com']) {
        const mail = onlyNotificationTo(admin, reference);
        expect(mail.subject).toBe(`${reference}: a new Service Request`);
        expect(mail.text).toContain('Leaking tap');
        expect(mail.text).toContain('Block C, ground floor toilets');
        expect(mail.text).toContain('waiting for an Assignment');
      }
      expect(notificationsTo('ada@example.com')).toEqual([]);
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
      app.mailbox.clear();

      const reference = await submitServiceRequest(grace);

      onlyNotificationTo('linus@example.com', reference);
      for (const skipped of [
        'grace@example.com',
        'alan@example.com',
        'barbara@example.com',
        'invited@example.com',
      ]) {
        expect(notificationsTo(skipped)).toEqual([]);
      }
    });
  });

  describe('the Requester', () => {
    const requester = 'requester@example.com';

    it('hears when an Administrator gives the request an Assignment', async () => {
      const work = await requestInStatus(app, 'submitted');
      app.mailbox.clear();

      await assign(work.admin, work.reference, work.officerId);

      const mail = onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Assigned`);
      expect(mail.text).toContain('Leaking tap');
    });

    it('hears when its officer starts the work', async () => {
      const work = await requestInStatus(app, 'assigned');
      app.mailbox.clear();

      await work.officer
        .post(`/api/service-requests/${work.reference}/start`)
        .expect(200);

      const mail = onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is In Progress`);
      expect(notificationsTo('officer@example.com')).toEqual([]);
    });

    it('hears when the work is Completed, with the link to answer Fixed or Not fixed', async () => {
      const work = await requestInStatus(app, 'in_progress');
      app.mailbox.clear();

      await work.officer
        .post(`/api/service-requests/${work.reference}/complete`)
        .send({ note: 'Replaced the washer.' })
        .expect(200);

      const mail = onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Completed`);
      expect(mail.text).toContain('Replaced the washer.');
      expect(mail.text).toContain('Fixed or Not fixed');
      expect(mail.text).toContain('7 days');
    });

    it('hears when an Administrator verifies it', async () => {
      const work = await requestInStatus(app, 'completed');
      app.mailbox.clear();

      await work.admin
        .post(`/api/service-requests/${work.reference}/verify`)
        .expect(200);

      const mail = onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Verified`);
      expect(notificationsTo('officer@example.com')).toEqual([]);
    });

    it('hears when the daily job verifies it after 7 days', async () => {
      const work = await requestInStatus(app, 'completed');
      app.mailbox.clear();
      app.clock.advance(7 * DAY);

      await app.runDailyCleanup();

      const mail = onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Verified`);
      expect(mail.text).toContain('automatically');
    });

    it('hears when an Administrator cancels it, with the reason', async () => {
      const work = await requestInStatus(app, 'submitted');
      app.mailbox.clear();

      await work.admin
        .post(`/api/service-requests/${work.reference}/cancel`)
        .send({ reason: 'Reported twice.' })
        .expect(200);

      const mail = onlyNotificationTo(requester, work.reference);
      expect(mail.subject).toBe(`${work.reference} is Cancelled`);
      expect(mail.text).toContain('Reported twice.');
    });

    it('isn’t emailed about their own verification or cancellation', async () => {
      const completed = await requestInStatus(app, 'completed');
      const submitted = await submitServiceRequest(completed.requester);
      app.mailbox.clear();

      await completed.requester
        .post(`/api/service-requests/${completed.reference}/verify`)
        .expect(200);
      await completed.requester
        .post(`/api/service-requests/${submitted}/cancel`)
        .send({ reason: 'Fixed itself.' })
        .expect(200);

      expect(app.mailbox.mails).toEqual([]);
    });

    it('isn’t emailed about Progress Notes, Priority or corrected details', async () => {
      const work = await requestInStatus(app, 'in_progress');
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

      expect(app.mailbox.mails).toEqual([]);
    });

    it('gets nothing once Deactivated or Erased', async () => {
      const deactivated = await requestInStatus(app, 'submitted');
      await deactivated.admin
        .post(`/api/users/${deactivated.requesterId}/deactivate`)
        .expect(200);
      const ada = await app.signUp('ada@example.com');
      const erased = await submitServiceRequest(ada);
      await ada.delete('/api/me').expect(204);
      app.mailbox.clear();

      for (const reference of [deactivated.reference, erased]) {
        await deactivated.admin
          .post(`/api/service-requests/${reference}/cancel`)
          .send({ reason: 'Reported twice.' })
          .expect(200);
      }

      expect(notificationsTo(requester)).toEqual([]);
      expect(notificationsTo('ada@example.com')).toEqual([]);
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
      app.mailbox.clear();

      await assign(work.admin, work.reference, work.officerId);

      const mail = onlyNotificationTo(officer, work.reference);
      expect(mail.subject).toBe(`${work.reference}: a new Assignment`);
      expect(mail.text).toContain('Leaking tap');
      expect(mail.text).toContain('Block C, ground floor toilets');
      expect(mail.text).toContain('Urgent');
      expect(notificationsTo('admin@example.com')).toEqual([]);
    });

    it('hears when it’s reassigned, while the new officer hears they have it', async () => {
      const work = await requestInStatus(app, 'assigned');
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      app.mailbox.clear();

      await assign(work.admin, work.reference, await idOf(ngozi));

      const ended = onlyNotificationTo(officer, work.reference);
      expect(ended.subject).toBe(
        `${work.reference}: your Assignment has ended`,
      );
      expect(ended.text).toContain('another Maintenance Officer');
      expect(
        onlyNotificationTo('ngozi@example.com', work.reference).subject,
      ).toBe(`${work.reference}: a new Assignment`);
      // Still Assigned, so the Requester has no Status Update to hear about.
      expect(notificationsTo('requester@example.com')).toEqual([]);
    });

    it('lets the Requester hear when In Progress work is reassigned', async () => {
      const work = await requestInStatus(app, 'in_progress');
      const ngozi = await app.signInAsMaintenanceOfficer('ngozi@example.com');
      app.mailbox.clear();

      await assign(work.admin, work.reference, await idOf(ngozi));

      expect(
        onlyNotificationTo('requester@example.com', work.reference).subject,
      ).toBe(`${work.reference} is Assigned`);
    });

    it('hears when it’s unassigned, as the Requester and other Administrators hear it’s Submitted again', async () => {
      const work = await requestInStatus(app, 'in_progress');
      await app.signInAsAdministrator('alan@example.com');
      app.mailbox.clear();

      await work.admin
        .delete(`/api/service-requests/${work.reference}/assignment`)
        .expect(200);

      const ended = onlyNotificationTo(officer, work.reference);
      expect(ended.subject).toBe(
        `${work.reference}: your Assignment has ended`,
      );
      expect(ended.text).toContain('unassigned');
      expect(
        onlyNotificationTo('requester@example.com', work.reference).subject,
      ).toBe(`${work.reference} is Submitted again`);
      const queued = onlyNotificationTo('alan@example.com', work.reference);
      expect(queued.subject).toBe(`${work.reference} is Submitted again`);
      expect(queued.text).toContain('unassigned');
      expect(queued.text).toContain('waiting for an Assignment');
      expect(notificationsTo('admin@example.com')).toEqual([]);
    });

    it('hears when an Administrator cancels their work, with the reason', async () => {
      const work = await requestInStatus(app, 'in_progress');
      app.mailbox.clear();

      await work.admin
        .post(`/api/service-requests/${work.reference}/cancel`)
        .send({ reason: 'The block is being demolished.' })
        .expect(200);

      const ended = onlyNotificationTo(officer, work.reference);
      expect(ended.subject).toBe(
        `${work.reference}: your Assignment has ended`,
      );
      expect(ended.text).toContain('Cancelled');
      expect(ended.text).toContain('The block is being demolished.');
      expect(
        onlyNotificationTo('requester@example.com', work.reference).subject,
      ).toBe(`${work.reference} is Cancelled`);
    });

    it('hears when the Requester answers Not fixed, with the reason', async () => {
      const work = await requestInStatus(app, 'completed');
      app.mailbox.clear();

      await work.requester
        .post(`/api/service-requests/${work.reference}/not-fixed`)
        .send({ reason: 'It still drips.' })
        .expect(200);

      const mail = onlyNotificationTo(officer, work.reference);
      expect(mail.subject).toBe(`${work.reference}: answered Not fixed`);
      expect(mail.text).toContain('It still drips.');
      expect(mail.text).toContain('Assigned');
      expect(notificationsTo('requester@example.com')).toEqual([]);
      expect(notificationsTo('admin@example.com')).toEqual([]);
    });

    it('is replaced by every active Administrator when Not fixed comes back after they’ve left', async () => {
      const work = await requestInStatus(app, 'completed');
      await work.admin
        .post(`/api/users/${work.officerId}/deactivate`)
        .expect(200);
      app.mailbox.clear();

      await work.requester
        .post(`/api/service-requests/${work.reference}/not-fixed`)
        .send({ reason: 'It still drips.' })
        .expect(200);

      const queued = onlyNotificationTo('admin@example.com', work.reference);
      expect(queued.subject).toBe(`${work.reference} is Submitted again`);
      expect(queued.text).toContain('Not fixed');
      expect(queued.text).toContain('It still drips.');
      expect(notificationsTo(officer)).toEqual([]);
      expect(notificationsTo('requester@example.com')).toEqual([]);
    });

    it('gets one email when they’re also the Requester', async () => {
      const admin = await app.signInAsAdministrator();
      const chinedu = await app.signInAsMaintenanceOfficer();
      const reference = await submitServiceRequest(chinedu);
      app.mailbox.clear();

      await assign(admin, reference, await idOf(chinedu));

      const mail = onlyNotificationTo(officer, reference);
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
      app.mailbox.clear();
      return { admin, officer, officerId, open, completed };
    };

    const subjectsTo = (email: string) =>
      notificationsTo(email)
        .map(({ subject }) => subject)
        .sort();

    it('emails the Requester and the other Administrators once per handed-back request', async () => {
      const work = await anOfficerWithWork();

      await work.admin
        .post(`/api/users/${work.officerId}/deactivate`)
        .expect(200);

      const handedBack = work.open
        .map((reference) => `${reference} is Submitted again`)
        .sort();
      expect(subjectsTo('ada@example.com')).toEqual(handedBack);
      expect(subjectsTo('alan@example.com')).toEqual(handedBack);
      for (const mail of notificationsTo('alan@example.com')) {
        expect(mail.text).toContain('no longer available');
      }
      expect(subjectsTo('grace@example.com')).toEqual([]);
      expect(subjectsTo('chinedu@example.com')).toEqual([]);
    });

    it('tells a demoted officer each Assignment has ended', async () => {
      const work = await anOfficerWithWork();

      await work.admin
        .patch(`/api/users/${work.officerId}/role`)
        .send({ role: 'staff' })
        .expect(200);

      expect(subjectsTo('chinedu@example.com')).toEqual(
        work.open
          .map((reference) => `${reference}: your Assignment has ended`)
          .sort(),
      );
      expect(notificationsTo('chinedu@example.com')[0].text).toContain(
        'no longer a Maintenance Officer',
      );
    });

    it('emails every Administrator when the officer erases themselves', async () => {
      const work = await anOfficerWithWork();

      await work.officer.delete('/api/me').expect(204);

      for (const admin of ['grace@example.com', 'alan@example.com']) {
        expect(subjectsTo(admin)).toHaveLength(2);
      }
    });
  });

  describe('a failed send', () => {
    afterEach(() => vi.restoreAllMocks());

    it('is logged, while the change stands and everyone else is emailed', async () => {
      const work = await requestInStatus(app, 'in_progress');
      app.mailbox.clear();
      const logged = vi.spyOn(Logger.prototype, 'error');
      app.mailbox.failNext(
        new MailError('Mailbox unavailable', { permanent: true, code: 550 }),
      );

      await work.admin
        .post(`/api/service-requests/${work.reference}/cancel`)
        .send({ reason: 'Reported twice.' })
        .expect(200);

      const shown = await work.admin
        .get(`/api/service-requests/${work.reference}`)
        .expect(200);
      expect(shown.body.status).toBe('cancelled');
      expect(notificationsTo('officer@example.com')).toEqual([]);
      onlyNotificationTo('requester@example.com', work.reference);
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining(work.reference),
        expect.any(MailError),
      );
    });
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
    app.mailbox.clear();

    await work.admin
      .post(`/api/service-requests/${work.reference}/cancel`)
      .send({ reason: 'Reported twice.' })
      .expect(500);

    expect(app.mailbox.mails).toEqual([]);
    const shown = await work.admin
      .get(`/api/service-requests/${work.reference}`)
      .expect(200);
    expect(shown.body.status).toBe('in_progress');
  });

  it('sends nothing for an officer’s departure that never commits', async () => {
    const work = await requestInStatus(app, 'in_progress');
    await app.signInAsAdministrator('alan@example.com');
    app.mailbox.clear();

    await work.admin
      .post(`/api/users/${work.officerId}/deactivate`)
      .expect(500);

    expect(app.mailbox.mails).toEqual([]);
    const shown = await work.admin
      .get(`/api/service-requests/${work.reference}`)
      .expect(200);
    expect(shown.body.status).toBe('in_progress');
  });
});
