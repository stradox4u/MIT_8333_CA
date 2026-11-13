import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  SERVICE_REQUEST_STATUSES,
  serviceRequests,
  users,
} from '../database/schema.js';
import { ServiceRequestLifecycle } from './service-request-lifecycle.js';
import { STATUS_NAMES } from './refusals.js';

/** Seeds realistic history through the same lifecycle as ordinary requests. */
@Injectable()
export class DemoServiceRequests {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async seed(domain: string): Promise<void> {
    const roles = ['administrator', 'officer', 'student', 'staff'] as const;
    const accounts = await this.db
      .select({ id: users.id, email: users.email, role: users.roleId })
      .from(users)
      .where(
        inArray(
          users.email,
          roles.map((role) => `${role}@${domain}`),
        ),
      );
    const account = (name: (typeof roles)[number]) => {
      const found = accounts.find((user) => user.email === `${name}@${domain}`);
      const role = name === 'officer' ? 'maintenance_officer' : name;
      if (!found || found.role !== role)
        throw new Error(
          'Seed the four demo accounts before their Service Requests',
        );
      return found.id;
    };
    const adminId = account('administrator');
    const officerId = account('officer');
    for (const role of ['student', 'staff'] as const) {
      const requesterId = account(role);
      for (const [index, status] of SERVICE_REQUEST_STATUSES.entries()) {
        await this.db.transaction(async (tx) => {
          // The owner lock serializes concurrent seeds before the private slot check.
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, requesterId))
            .for('update');
          const demoKey = `${requesterId}:${status}`;
          const [existing] = await tx
            .select({ id: serviceRequests.id })
            .from(serviceRequests)
            .where(eq(serviceRequests.demoKey, demoKey));
          if (existing) return;
          let at = this.clock.now() - (index + 1) * 60 * 60 * 1000;
          const lifecycle = new ServiceRequestLifecycle(tx, { now: () => at });
          const submitted = await lifecycle.submit({
            requesterId,
            title: `Demo plumbing fault: ${STATUS_NAMES[status]}`,
            categoryId: 'plumbing',
            location: `${role === 'student' ? 'Student residence' : 'Staff office'}, ground floor`,
            description:
              'A demonstration report about a leaking tap, with no personal details.',
          });
          if (typeof submitted === 'string')
            throw new Error('The demo Request Category is missing');
          const { reference } = submitted;
          await tx
            .update(serviceRequests)
            .set({ demoKey })
            .where(eq(serviceRequests.reference, reference));
          at += 30_000;
          expectOutcome(
            await lifecycle.addProgressNote(
              reference,
              requesterId,
              'The leak is beside the ground-floor sink.',
            ),
            'added',
          );
          if (status === 'submitted') return;
          at += 60_000;
          expectOutcome(
            await lifecycle.assign(reference, officerId, adminId),
            'assigned',
          );
          if (status === 'assigned') return;
          at += 60_000;
          if (status === 'cancelled') {
            expectOutcome(
              await lifecycle.cancel(
                reference,
                adminId,
                'Duplicate demonstration report.',
              ),
              'cancelled',
            );
            return;
          }
          expectOutcome(await lifecycle.start(reference, officerId), 'started');
          if (status === 'in_progress') return;
          at += 60_000;
          expectOutcome(
            await lifecycle.complete(
              reference,
              officerId,
              'Replaced the tap washer.',
            ),
            'completed',
          );
          if (status === 'verified') {
            at += 60_000;
            expectOutcome(
              await lifecycle.verify(reference, requesterId),
              'verified',
            );
          }
        });
      }
    }
  }
}

function expectOutcome(result: unknown, expected: string) {
  if (result !== expected)
    throw new Error(`Could not seed demo work: expected ${expected}`);
}
