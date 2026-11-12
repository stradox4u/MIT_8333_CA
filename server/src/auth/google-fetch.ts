import { Injectable, Module } from '@nestjs/common';

/**
 * How Google sign-in reaches Google (discovery, keys, tokens, userinfo).
 * The real `fetch`; tests swap in a fake Google here.
 */
@Injectable()
export class GoogleFetch {
  fetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
}

@Module({ providers: [GoogleFetch], exports: [GoogleFetch] })
export class GoogleFetchModule {}
