import { MailTransport } from '@nestjs/mail';
import { createObserveModule } from '@nestjs/observe';
import type { Environment } from './config/environment.js';

/**
 * NestJS Observe: traces, logs, metrics and errors, reported to
 * https://observe.nestjs.com. `ObserveInstrument` goes to
 * `NestFactory.create()`, which wraps providers to trace their methods.
 *
 * Mail transports are left unwrapped: they keep their state in private class
 * fields, which refuse the wrapper as `this` and would fail every email.
 */
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  skipInstrumentation: (instance) => instance instanceof MailTransport,
});

/** Observe's keys, named through the config schema so a rename breaks the build. */
const OBSERVE_KEYS = [
  'OBSERVE_APP_KEY',
  'OBSERVE_APP_SECRET',
] as const satisfies readonly (keyof Environment)[];

/**
 * Whether Observe has its keys. Without both, the app runs without it:
 * Observe would otherwise keep sending data its service refuses. Blank keys
 * count as unset.
 *
 * One of the few direct reads of the environment (see `AppConfig`):
 * `ConditionalModule` decides which modules exist before dependency
 * injection, so `AppConfig` isn't available yet. It passes the environment
 * `@nestjs/config` loaded.
 */
export function observeIsConfigured(env: NodeJS.ProcessEnv): boolean {
  return OBSERVE_KEYS.every((key) => Boolean(env[key]?.trim()));
}
