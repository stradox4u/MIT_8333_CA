import { SmtpTransport } from '@nestjs/mail';
import { ObserveInstrument } from './observe.js';

describe('Observe instrumentation', () => {
  // Observe wraps providers in a proxy. Mail transports keep their state in
  // private class fields, which refuse a proxy as `this`, so wrapping one
  // turns every email into a 500 in production.
  it('leaves mail transports unwrapped', () => {
    const transport = new SmtpTransport({ url: 'smtp://localhost:1025' });

    expect(ObserveInstrument!.instanceDecorator(transport)).toBe(transport);
  });
});
