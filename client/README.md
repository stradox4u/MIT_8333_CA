# MIT 8333 University client

Vue authentication client using Vite, TypeScript, Pinia, Vue Router, TanStack
Query, Tailwind CSS and unplugin-icons. Node 24.15 or newer is required.

## Local development

To run the client with hot reload alongside the API, Postgres and Mailpit, use
`docker compose up --build -d` from the repository root. See the
[root README](../README.md) for URLs, optional Google credentials and demo data.
Compose mounts the client source into Vite, so saved edits appear immediately
without rebuilding the stack. After changing dependencies, rebuild only the
client with `docker compose up --build --no-deps --renew-anon-volumes -d client`.
The following commands run the Vite development server directly on the host.

```sh
cd client
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Start the Nest API separately using the server's
README. Vite proxies `/api` to http://127.0.0.1:3000 by default; override
`API_PROXY_TARGET` in `client/.env.local` if needed. Configure the server's
`APP_URL` as `http://127.0.0.1:5173` and `COOKIE_SECURE=false`
for HTTP development. The browser always talks to the client's origin.

TanStack Query owns identity and sessions. Pinia holds shared UI state only.
Session credentials remain in the server's HttpOnly cookie. An emailed link
requires explicit confirmation; opening its URL does not consume it. Passwords
stay in component memory, and link tokens are removed from the displayed URL.
Navigation hints expire after 15 minutes and never authorize a sensitive action.

Dashboard summaries and short lists follow each Role: Students and Staff see their
own requests and Completed answers, Maintenance Officers see current Assignments
by Priority, and Administrators see campus queues and Open category counts.
List search, filters, sort and page live in shareable URLs; pagination stays on
the API. Recent requests are ordered by newest submission, and submitted-date
filters include whole UTC days.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Integration tests mount the whole Vue app with real Router, Query and Pinia,
mocking HTTP at the boundary. Browser tests automatically start the client and
the real local Nest API fixture with PGlite, captured mail, a test clock and fake
Google. They do not need a production database, SMTP or Google credentials.
Ports 5173, 4174 and 4175 must be free. The fixture is separate from the ordinary
server test suites; see `server/test/browser/README.md` for runner controls.
Tests close their owned servers on exit. Playwright screenshots/traces are
written to ignored `test-results/` on failure; desktop/mobile reference captures
are also saved there by the browser suite.

## Netlify and Railway

The client Dockerfile runs Vite for local development. In production, the root
`netlify.toml` builds this directory and Netlify serves `client/dist`.
Set Netlify build environment variable `API_ORIGIN` to the HTTPS Railway API
origin, for example `https://your-api.up.railway.app`, with no path or credentials.
The build generates `dist/_redirects` with the `/api/*` proxy before the SPA
fallback. A missing or invalid origin fails the deployment build.

Configure the server `APP_URL` as the deployed client origin and enable secure
cookies in production. Register the Google callback using the client origin's
`/api/auth/oidc/google/callback` URL. Keep API secrets in Railway, never in Vite
environment variables. No deployment is performed by these scripts.

This branch is based on `main` after `feature/auth-module` merged in PR #1.
