import { Injectable, Logger } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { OnEvent } from '@nestjs/event-emitter';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  SERVICE_REQUESTS_COMMITTED,
  type ServiceRequestChange,
} from './service-request-events.js';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  type Priority,
  type ServiceRequestStatus,
  requestCategories,
  serviceRequests,
  users,
} from '../database/schema.js';
import { activeWithRole } from '../users/active-users.js';
import { PRIORITY_LABELS, STATUS_LABELS } from './labels.js';

/** The request as its emails describe it, read once the change commits. */
interface Described {
  reference: string;
  title: string;
  location: string;
  category: string;
  priority: Priority;
}

/** One thing to tell one User; a User's notices about a change share one email. */
interface Notice {
  recipientId: string;
  subject: string;
  paragraph: string;
}

interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * The emails about Service Requests (docs/service-requests.md, "Email
 * notifications"). Sent once a change commits; a failure is logged and the
 * change stands.
 */
@Injectable()
export class ServiceRequestNotifications {
  private readonly logger = new Logger(ServiceRequestNotifications.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly mailer: Mailer,
    private readonly config: AppConfig,
  ) {}

  /** Drains committed notifications before shutdown or a test fixture reset. */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.all(this.pending);
  }

  async onModuleDestroy(): Promise<void> {
    await this.settled();
  }

  /** Starts delivery after commit without making the HTTP response wait for SMTP. */
  @OnEvent(SERVICE_REQUESTS_COMMITTED)
  onCommitted(changes: readonly ServiceRequestChange[]): void {
    const delivery = nextTurn()
      .then(() => this.deliver(changes))
      .catch((error: unknown) => {
        this.logger.error('Couldn’t deliver Service Request emails', error);
      });
    this.pending.add(delivery);
    void delivery.then(() => this.pending.delete(delivery));
  }

  private async deliver(
    changes: readonly ServiceRequestChange[],
  ): Promise<void> {
    for (const change of changes) {
      let mails: Mail[];
      try {
        mails = await this.compose(change);
      } catch (error) {
        this.logger.error(
          `Couldn’t prepare emails about ${change.reference}`,
          error,
        );
        continue;
      }
      await Promise.all(
        mails.map((mail) =>
          this.mailer
            .send(mail)
            .catch((error: unknown) =>
              this.logger.error(
                `Couldn’t send “${mail.subject}” to a recipient`,
                error,
              ),
            ),
        ),
      );
    }
  }

  /** One email per recipient, leaving out the actor and anyone unreachable. */
  private async compose(change: ServiceRequestChange): Promise<Mail[]> {
    const request = await this.describe(change.reference);
    const notices = [
      ...forOfficers(change, request),
      ...forRequester(change, request),
      ...(await this.forAdministrators(change, request)),
    ].filter(({ recipientId }) => recipientId !== change.actorId);
    if (notices.length === 0) {
      return [];
    }
    const ids = [...new Set(notices.map(({ recipientId }) => recipientId))];
    const recipients = await this.reachable(ids);
    const link = new URL(`/requests/${change.reference}`, this.config.appUrl)
      .href;
    return ids.flatMap((id) => {
      const recipient = recipients.get(id);
      if (!recipient) {
        return [];
      }
      const theirs = notices.filter(({ recipientId }) => recipientId === id);
      return {
        to: recipient.email,
        subject: theirs[0].subject,
        text:
          [
            `Hello ${recipient.firstName},`,
            ...theirs.map(({ paragraph }) => paragraph),
          ].join('\n\n') + `\n\nSee ${change.reference}:\n${link}`,
      };
    });
  }

  /** Every active Administrator, when the request becomes Submitted. */
  private async forAdministrators(
    change: ServiceRequestChange,
    request: Described,
  ): Promise<Notice[]> {
    const moved = change.moved;
    if (moved?.to !== 'submitted') {
      return [];
    }
    const admins = await this.db
      .select({ id: users.id })
      .from(users)
      .where(activeWithRole('administrator'));
    const { reference, title, location, category } = request;
    const notice =
      moved.from === null
        ? {
            subject: `${reference}: a new Service Request`,
            paragraph: `${reference}, “${title}”, is a new ${category} Service Request at ${location}. It’s waiting for an Assignment.`,
          }
        : {
            subject: `${reference} is Submitted again`,
            paragraph:
              `${reference}, “${title}”, at ${location}, is Submitted again: ${handedBackBecause(change)}. ` +
              'It’s waiting for an Assignment.' +
              quoted('The reason given', moved.reason),
          };
    return admins.map(({ id }) => ({ recipientId: id, ...notice }));
  }

  private async describe(reference: string): Promise<Described> {
    const [request] = await this.db
      .select({
        reference: serviceRequests.reference,
        title: serviceRequests.title,
        location: serviceRequests.location,
        category: requestCategories.name,
        priority: serviceRequests.priority,
      })
      .from(serviceRequests)
      .innerJoin(
        requestCategories,
        eq(requestCategories.id, serviceRequests.categoryId),
      )
      .where(eq(serviceRequests.reference, reference));
    return request;
  }

  /** Those of `ids` who can get email: neither Deactivated nor Erased. */
  private async reachable(ids: string[]) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
      })
      .from(users)
      .where(
        and(
          inArray(users.id, ids),
          isNotNull(users.email),
          isNull(users.deactivatedAt),
          isNull(users.erasedAt),
        ),
      );
    return new Map(
      rows.map((row) => [
        row.id,
        { email: row.email!, firstName: row.firstName ?? 'there' },
      ]),
    );
  }
}

/** Officers hear about Assignments they're given or lose, and Not fixed answers. */
function forOfficers(
  change: ServiceRequestChange,
  request: Described,
): Notice[] {
  const { reference, title, location, category, priority } = request;
  const notices: Notice[] = [];
  if (change.ended) {
    const because = {
      reassigned: ': an Administrator gave it to another Maintenance Officer.',
      unassigned: ': an Administrator unassigned it.',
      cancelled:
        ': an Administrator Cancelled the request.' +
        quoted('The reason given', change.moved?.reason),
      officer_left: ' because you’re no longer a Maintenance Officer.',
    }[change.ended.why];
    notices.push({
      recipientId: change.ended.officerId,
      subject: `${reference}: your Assignment has ended`,
      paragraph: `Your Assignment on ${reference}, “${title}”, has ended${because}`,
    });
  }
  if (change.assignedTo) {
    notices.push({
      recipientId: change.assignedTo,
      subject: `${reference}: a new Assignment`,
      paragraph: `You have a new Assignment: ${reference}, “${title}”, a ${category} Service Request at ${location}, with ${PRIORITY_LABELS[priority]} Priority.`,
    });
  }
  if (change.returnedTo) {
    notices.push({
      recipientId: change.returnedTo,
      subject: `${reference}: answered Not fixed`,
      paragraph:
        `The Requester answered Not fixed on ${reference}, “${title}”, so it’s Assigned to you again.` +
        quoted('The reason given', change.moved?.reason),
    });
  }
  return notices;
}

/** The Requester hears about every Status Update on their request. */
function forRequester(
  change: ServiceRequestChange,
  request: Described,
): Notice[] {
  const moved = change.moved;
  if (!moved || moved.from === null) {
    return [];
  }
  const yours = `Your Service Request ${request.reference}, “${request.title}”,`;
  const paragraphs: Record<ServiceRequestStatus, string> = {
    submitted: `${yours} is Submitted again. It’s waiting for an Administrator to give it a new Assignment.`,
    assigned: `${yours} is Assigned to a Maintenance Officer, who will start the work.`,
    in_progress: `${yours} is In Progress: its Maintenance Officer has started the work.`,
    completed:
      `${yours} is Completed: its Maintenance Officer says the work is done.` +
      quoted('Their note', moved.note) +
      '\n\nIs the fault fixed? Answer Fixed or Not fixed on its tracking page. ' +
      'If you don’t answer within 7 days, it will be Verified automatically.',
    verified:
      change.actorId === null
        ? `${yours} was Verified automatically, 7 days after it was Completed.`
        : `${yours} is Verified: an Administrator confirmed the fault is fixed.`,
    cancelled:
      `${yours} is Cancelled.` + quoted('The reason given', moved.reason),
  };
  return [
    {
      recipientId: change.requesterId,
      subject:
        moved.to === 'submitted'
          ? `${request.reference} is Submitted again`
          : `${request.reference} is ${STATUS_LABELS[moved.to]}`,
      paragraph: paragraphs[moved.to],
    },
  ];
}

/** Why a request went back to Submitted, for the Administrators. */
function handedBackBecause(change: ServiceRequestChange) {
  if (change.moved?.from === 'completed') {
    return 'its Requester answered Not fixed, and its Maintenance Officer has left';
  }
  return change.ended?.why === 'officer_left'
    ? 'its Maintenance Officer is no longer available'
    : 'an Administrator unassigned it';
}

/** A User's own words, as their own paragraph; nothing when there are none. */
function quoted(label: string, text: string | null | undefined) {
  return text ? `\n\n${label}: “${text}”` : '';
}
