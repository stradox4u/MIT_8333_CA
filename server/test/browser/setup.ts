import { browserTestEnvironment } from './environment.js';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject) {
  Object.assign(process.env, browserTestEnvironment);
  const { startBrowserFixture } = await import('./fixture.js');
  const fixture = await startBrowserFixture();
  // The dedicated watcher owns this process. Vitest's default OS-signal
  // listeners exit immediately, bypassing global teardown; defer exit through
  // its public API so the fixture and database close first.
  const signalHandlers = (['SIGINT', 'SIGTERM'] as const).map((signal) => {
    const previous = process.rawListeners(signal) as NodeJS.SignalsListener[];
    for (const listener of previous) process.removeListener(signal, listener);
    const terminate = () => {
      void (async () => {
        try {
          await project.vitest.cancelCurrentRun('keyboard-input');
        } finally {
          process.exitCode = signal === 'SIGINT' ? 130 : 143;
          await project.vitest.exit(true);
        }
      })();
    };
    process.on(signal, terminate);
    return { signal, previous, terminate };
  });
  return async () => {
    try {
      await fixture.close();
    } finally {
      for (const { signal, previous, terminate } of signalHandlers) {
        process.removeListener(signal, terminate);
        for (const listener of previous) process.on(signal, listener);
      }
    }
  };
}
