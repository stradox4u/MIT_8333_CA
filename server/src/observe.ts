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
