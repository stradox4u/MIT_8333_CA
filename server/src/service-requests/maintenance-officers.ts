import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  assignments,
  OPEN_STATUSES,
  serviceRequests,
  users,
} from '../database/schema.js';
import { activeWithRole } from '../users/active-users.js';
import { displayName } from '../users/display-name.js';
import type { MaintenanceOfficer } from './service-request.responses.js';

/** The Maintenance Officers an Administrator can give requests to. */
@Injectable()
export class MaintenanceOfficers {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /**
   * The active ones, by name, each with how many Open requests they hold:
   * Assigned or In Progress. Completed ones keep their Assignment, but the
   * work on them is done.
   */
  list(): Promise<MaintenanceOfficer[]> {
    const name = displayName(users);
    return this.db
      .select({
        id: users.id,
        name,
        openAssignments: count(serviceRequests.id),
      })
      .from(users)
      .leftJoin(
        assignments,
        and(eq(assignments.officerId, users.id), isNull(assignments.endedAt)),
      )
      .leftJoin(
        serviceRequests,
        and(
          eq(serviceRequests.id, assignments.serviceRequestId),
          inArray(serviceRequests.status, OPEN_STATUSES),
        ),
      )
      .where(activeWithRole('maintenance_officer'))
      .groupBy(users.id)
      .orderBy(asc(name), asc(users.id));
  }
}
