import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';

export const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';

const ISSUER = 'https://accounts.google.com';
const ENDPOINTS = {
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
};

/** The Google account a test signs in with. */
export interface GoogleAccount {
  /** Google's stable id for the account. */
  sub: string;
  email: string;
  emailVerified?: boolean;
  givenName?: string;
  familyName?: string;
}

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url');

/**
 * Google's side of OpenID Connect, served through the `fetch` the app's
 * Google sign-in uses: discovery, signing keys, the token endpoint and
 * userinfo. ID tokens are real RS256 JWTs signed with a key made per test
 * run, so the app verifies them exactly as it verifies Google's.
 */
export class FakeGoogle {
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codes = new Map<
    string,
    { account: GoogleAccount; nonce: string }
  >();
  private readonly accessTokens = new Map<string, Record<string, unknown>>();

  constructor(private readonly now: () => number) {}

  /** What Google's consent screen does: returns a code for this account. */
  approve(account: GoogleAccount, nonce: string): string {
    const code = randomUUID();
    this.codes.set(code, { account, nonce });
    return code;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const endpoint = url.origin + url.pathname;
    switch (endpoint) {
      case `${ISSUER}/.well-known/openid-configuration`:
        return json({
          issuer: ISSUER,
          authorization_endpoint: ENDPOINTS.authorization,
          token_endpoint: ENDPOINTS.token,
          userinfo_endpoint: ENDPOINTS.userinfo,
          jwks_uri: ENDPOINTS.jwks,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
        });
      case ENDPOINTS.jwks:
        return json({
          keys: [
            {
              ...this.keys.publicKey.export({ format: 'jwk' }),
              kid: 'test-key',
              alg: 'RS256',
              use: 'sig',
            },
          ],
        });
      case ENDPOINTS.token:
        return this.exchange(new URLSearchParams(String(init?.body ?? '')));
      case ENDPOINTS.userinfo: {
        const token = new Headers(init?.headers)
          .get('authorization')
          ?.replace(/^Bearer /, '');
        const claims = token && this.accessTokens.get(token);
        return claims ? json(claims) : json({ error: 'invalid_token' }, 401);
      }
      default:
        return json({ error: 'not_found' }, 404);
    }
  };

  private exchange(form: URLSearchParams) {
    const grant = this.codes.get(form.get('code') ?? '');
    if (!grant) {
      return json({ error: 'invalid_grant' }, 400);
    }
    this.codes.delete(form.get('code')!);
    const { account, nonce } = grant;
    const issuedAt = Math.floor(this.now() / 1000);
    const claims = {
      sub: account.sub,
      email: account.email,
      email_verified: account.emailVerified ?? true,
      ...(account.givenName && { given_name: account.givenName }),
      ...(account.familyName && { family_name: account.familyName }),
    };
    const accessToken = randomUUID();
    this.accessTokens.set(accessToken, claims);
    return json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: this.idToken({
        ...claims,
        iss: ISSUER,
        aud: GOOGLE_CLIENT_ID,
        azp: GOOGLE_CLIENT_ID,
        iat: issuedAt,
        exp: issuedAt + 3600,
        nonce,
      }),
    });
  }

  private idToken(claims: Record<string, unknown>) {
    const header = base64url(
      JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }),
    );
    const payload = base64url(JSON.stringify(claims));
    const signature = sign(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      this.keys.privateKey,
    );
    return `${header}.${payload}.${base64url(signature)}`;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
