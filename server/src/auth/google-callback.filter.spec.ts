import { type ArgumentsHost, ForbiddenException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfig } from '../config/app-config.js';
import { GoogleCallbackFilter } from './google-callback.filter.js';

afterEach(() => vi.restoreAllMocks());

it('redirects and safely logs unexpected internal failures, without classifying by error text', async () => {
  const module = await Test.createTestingModule({
    providers: [
      GoogleCallbackFilter,
      {
        provide: AppConfig,
        useValue: { appUrl: 'https://maintenance.example' },
      },
    ],
  }).compile();
  const response = { setHeader: vi.fn(), redirect: vi.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as ArgumentsHost;
  const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  const filter = module.get(GoogleCallbackFilter);

  try {
    filter.catch(new Error('private-state-and-code'), host);
    expect(response.redirect).toHaveBeenLastCalledWith(
      302,
      'https://maintenance.example/sign-in?error=google_sign_in_failed',
    );
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'private-state-and-code',
    );

    // Only the typed deactivation error is special, never a lookalike body.
    filter.catch(
      new ForbiddenException({ error: 'account_deactivated' }),
      host,
    );
    expect(response.redirect).toHaveBeenLastCalledWith(
      302,
      'https://maintenance.example/sign-in?error=google_sign_in_failed',
    );
  } finally {
    await module.close();
  }
});
