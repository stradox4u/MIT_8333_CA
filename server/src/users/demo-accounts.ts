import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { newPassword } from '../auth/auth.schemas.js';
import type { AppConfig } from '../config/app-config.js';
import type { RoleId } from '../database/schema.js';
import { UsersRepository } from './users.repository.js';

const DEMO_USERS: {
  localPart: string;
  firstName: string;
  lastName: string;
  roleId: RoleId;
}[] = [
  {
    localPart: 'administrator',
    firstName: 'Demo',
    lastName: 'Administrator',
    roleId: 'administrator',
  },
  {
    localPart: 'officer',
    firstName: 'Demo',
    lastName: 'Officer',
    roleId: 'maintenance_officer',
  },
  {
    localPart: 'student',
    firstName: 'Demo',
    lastName: 'Student',
    roleId: 'student',
  },
  { localPart: 'staff', firstName: 'Demo', lastName: 'Staff', roleId: 'staff' },
];

/**
 * One account per Role for markers, who can't receive the accounts' email,
 * to sign in with a password (ADR-0006). `npm run db:seed` runs it; running
 * it again resets the accounts to their demo state.
 *
 * - `password` (`DEMO_ACCOUNTS_PASSWORD`): shared by all four; must meet the
 *   password rules.
 * - `domain` (`DEMO_ACCOUNTS_DOMAIN`): their addresses are `administrator@`,
 *   `officer@`, `student@` and `staff@` it.
 */
@Injectable()
export class DemoAccounts {
  private readonly hasher = new PasswordHasher();

  constructor(private readonly users: UsersRepository) {}

  async seed({
    domain,
    password: demoPassword = '',
  }: AppConfig['demoAccounts']): Promise<void> {
    const rules = newPassword.safeParse(demoPassword);
    if (!rules.success) {
      throw new Error(
        `DEMO_ACCOUNTS_PASSWORD ${rules.error.issues.map((issue) => issue.message).join(', ')}`,
      );
    }
    const passwordHash = await this.hasher.hash(demoPassword);
    for (const { localPart, ...user } of DEMO_USERS) {
      await this.users.upsertDemoUser({
        ...user,
        email: `${localPart}@${domain}`,
        passwordHash,
      });
    }
  }
}
