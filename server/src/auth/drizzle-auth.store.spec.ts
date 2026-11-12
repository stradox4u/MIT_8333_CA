import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { createTestDatabase } from '../../test/support/test-database.js';
import { DrizzleAuthStore } from './drizzle-auth.store.js';

const MAX_PENDING = 5;

describe('DrizzleAuthStore', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database.close());

  const cases = authenticationStoreContract(
    async () => {
      await database.reset();
      const store = new DrizzleAuthStore(database.db, {
        maxPending: MAX_PENDING,
      });
      return { sessions: store, magicLinks: store, oidcStates: store };
    },
    {
      contracts: ['sessions', 'magicLinks', 'oidcStates'],
      concurrent: true,
      maxPending: MAX_PENDING,
    },
  );

  for (const { name, run } of cases) {
    it(name, run);
  }
});
