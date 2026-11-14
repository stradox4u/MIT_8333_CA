import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { Clock } from '../clock.js';
import { Photos } from '../photos/photos.js';
import { SERVICE_REQUEST_STATUSES } from './service-request.types.js';
import { ServiceRequestWritesRepository } from './service-request-writes.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { ServiceRequestLifecycle } from './service-request-lifecycle.js';
import { STATUS_NAMES } from './refusals.js';

/** Seeds realistic history through the same lifecycle as ordinary requests. */
@Injectable()
export class DemoServiceRequests {
  constructor(
    private readonly writes: ServiceRequestWritesRepository,
    private readonly users: UsersRepository,
    private readonly clock: Clock,
    private readonly photos: Photos,
  ) {}

  async seed(domain: string): Promise<void> {
    const roles = ['administrator', 'officer', 'student', 'staff'] as const;
    const accounts = await this.users.findDemoAccounts(
      roles.map((role) => `${role}@${domain}`),
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
        await this.writes.seedSlot(
          requesterId,
          status,
          async (store, demoKey) => {
            let at = this.clock.now() - (index + 1) * 60 * 60 * 1000;
            // Demo history emails nobody.
            const lifecycle = new ServiceRequestLifecycle(
              store,
              { now: () => at },
              new EventEmitter2(),
              this.photos,
            );
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
            await store.markDemo(reference, demoKey);
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
            expectOutcome(
              await lifecycle.start(reference, officerId),
              'started',
            );
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
          },
        );
      }
    }
  }
}

function expectOutcome(result: unknown, expected: string) {
  if (result !== expected)
    throw new Error(`Could not seed demo work: expected ${expected}`);
}
