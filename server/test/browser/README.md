# Browser API fixture

From `server/`, run `npm run test:browser`. The dedicated Vitest watcher starts
the real Nest API at `http://127.0.0.1:4174` and a separate test-control server at
`http://127.0.0.1:4175`. Its readiness test runs once and the servers stay up until
the watcher exits. SIGINT/SIGTERM teardown closes both servers and the in-memory
database. Do not use watch-mode reloads to reset a journey; use `/reset`.

Point the client dev server's `/api` proxy at port 4174 and serve the client at
`http://127.0.0.1:5173`. All cookies are test cookies without `Secure`.

The fixture uses the existing PGlite migrations, captured mailbox, FakeGoogle
and TestClock. Vite `.env` loading is disabled. Synthetic environment settings,
including `NODE_ENV=test` and empty Observe credentials, are applied before
importing the application. No user `.env`, real database, SMTP or Google
credentials are used. The serving entry is excluded from ordinary unit/e2e
selection, and everything under `test/` is excluded from production builds.

## Runner controls

Use the Playwright runner's HTTP request context, not page JavaScript. Controls
bind only to loopback, reject requests carrying `Origin`, and do not enable CORS.
Responses are JSON and are not cacheable. Send `Content-Type: application/json`
for controls with a body; body size is limited to 16 KiB.

| Request                                        | Result                                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                  | `200 {ok:true,apiUrl,clientUrl}`                                                                                                                     |
| `POST /reset`                                  | `200 {ok:true}`; clears users, sessions, transactions, captured mail, fake Google grants and the test clock; retains Role reference data             |
| `GET /mail?email=ada@example.test`             | `200 {email,subject,text,links,link}` for the latest captured message; `link` is the first URL or `null`; `404 {error:"mail_not_found"}` when absent |
| `POST /advance {milliseconds}`                 | `200 {now:"2026-11-12T09:16:00.000Z"}`; advances the test clock; nonnegative integer, at most one year per call                                      |
| `POST /google {authorizationUrl,account}`      | `200 {callbackUrl}`; fake-issued authorization code for the actual nonce and state, pointing to the client's `/api/auth/oidc/google/callback`        |
| `POST /invite {email,firstName,lastName,role}` | The real Administrator `/api/users` response, normally `201` with the managed User record; an Invitation is captured in mail                         |

Google `account` has required `sub` and `email`, plus optional `emailVerified`,
`givenName` and `familyName`. Intercept the browser's navigation to Google's
authorization URL, send that exact URL to `/google`, then navigate the browser
to the returned callback URL. This keeps the real browser's OIDC transaction
cookie and exercises the real callback and signed Google ID-token checks,
without any connection to Google.

Invitations are created through the real public API by a synthetic test
Administrator; no production test-only route is added. Invalid JSON/control
schemas return `400 {error:"invalid_request"}`, invalid authorization URLs
return `400 {error:"invalid_authorization_url"}`, browser-origin requests return
`403 {error:"runner_only"}`, and unknown controls return `404 {error:"not_found"}`.

Run browser journeys serially against this shared fixture. Call `/reset` before
each journey after prior requests settle, and create a fresh browser context to
discard client cookies/storage. The API session expires according to the
TestClock, which starts at `2026-11-12T09:00:00.000Z` on every reset.

## Checks

`npm run test:e2e -- test/browser/fixture.e2e-spec.ts` tests the controls on free
loopback ports, real link expiry, invitation onboarding, fake Google callbacks,
reset and isolation. `./node_modules/.bin/vitest run --config
./vitest.config.browser.ts` checks fixed-port startup/readiness and immediate
teardown without leaving a long-lived watcher.
