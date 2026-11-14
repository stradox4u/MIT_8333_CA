import { RateLimitCountersRepository } from './rate-limit-counters.repository.js';
import { createTestDatabase } from '../../test/support/test-database.js';
import { Clock } from '../clock.js';
import { RateLimitCounters } from './rate-limit-counters.js';

const WINDOW_MS = 15 * 60 * 1000;

class TestClock extends Clock {
  current = Date.parse('2026-11-12T09:00:00.000Z');
  now() {
    return this.current;
  }
}

describe('RateLimitCounters', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let clock: TestClock;
  let counters: RateLimitCounters;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  beforeEach(async () => {
    await database.reset();
    clock = new TestClock();
    counters = new RateLimitCounters(
      new RateLimitCountersRepository(database.db),
      clock,
    );
  });
  afterAll(() => database.close());

  it('takes a hit back within the window it was counted in', async () => {
    await counters.hit('key', WINDOW_MS);
    const second = await counters.hit('key', WINDOW_MS);

    await counters.takeBack(second);

    expect((await counters.hit('key', WINDOW_MS)).count).toBe(2);
  });

  it('does not take a hit back from a later window', async () => {
    const lastOfFirstWindow = await counters.hit('key', WINDOW_MS);
    clock.current += WINDOW_MS;
    for (let hit = 0; hit < 5; hit++) {
      await counters.hit('key', WINDOW_MS);
    }

    await counters.takeBack(lastOfFirstWindow);

    expect((await counters.hit('key', WINDOW_MS)).count).toBe(6);
  });
});
