/**
 * Whether cookies carry `Secure`. Only plain-HTTP test runs turn it off
 * (`COOKIE_SECURE=false`); browsers accept `Secure` cookies from
 * `http://localhost`, so local development keeps it on.
 */
export function cookiesAreSecure(env: NodeJS.ProcessEnv = process.env) {
  return env.COOKIE_SECURE !== 'false';
}

/**
 * Origins whose pages may send state-changing requests: the client app's.
 * Netlify rewrites `Host` to the API's own (ADR-0005), so the app's origin
 * never matches it and has to be listed.
 */
export function trustedOrigins(env: NodeJS.ProcessEnv = process.env) {
  return [new URL(appUrl(env)).origin];
}

/** The client app's public URL, where emailed links point. */
export function appUrl(env: NodeJS.ProcessEnv = process.env) {
  const url = env.APP_URL;
  if (!url) {
    throw new Error('APP_URL must be set');
  }
  return url;
}

/**
 * Whether the client's IP address reaches the API, so per-IP limits mean
 * something. Turn off (`RATE_LIMIT_BY_IP=false`) if the proxy in front hides
 * it (docs/auth-module.md, "Abuse protection").
 */
export function rateLimitByIp(env: NodeJS.ProcessEnv = process.env) {
  return env.RATE_LIMIT_BY_IP !== 'false';
}

/**
 * How many proxies sit in front of the API and append to `X-Forwarded-For`
 * (Netlify, then Railway's edge), so `request.ip` is the client's.
 */
export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env) {
  return Number(env.TRUST_PROXY_HOPS ?? 0);
}

/** The OAuth client registered for "Continue with Google". */
export function googleCredentials(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}
