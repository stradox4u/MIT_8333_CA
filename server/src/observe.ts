import { MailTransport } from '@nestjs/mail';
import { createObserveModule } from '@nestjs/observe';

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

/**
 * Whether Observe has its keys. Without both, the app runs without it:
 * Observe would otherwise keep sending data its service refuses. Called by
 * `ConditionalModule` with the environment `@nestjs/config` loaded.
 */
export function observeIsConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OBSERVE_APP_KEY && env.OBSERVE_APP_SECRET);
}
