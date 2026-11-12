import { observeIsConfigured } from './observe.js';

describe('Observe', () => {
  it('is switched on when both keys are set', () => {
    expect(
      observeIsConfigured({
        OBSERVE_APP_KEY: 'key',
        OBSERVE_APP_SECRET: 'secret',
      }),
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ OBSERVE_APP_KEY: 'key' }],
    [{ OBSERVE_APP_SECRET: 'secret' }],
    [{ OBSERVE_APP_KEY: '', OBSERVE_APP_SECRET: '' }],
    [{ OBSERVE_APP_KEY: '  ', OBSERVE_APP_SECRET: '  ' }],
  ])('stays off without both keys: %o', (env) => {
    expect(observeIsConfigured(env)).toBe(false);
  });
});
