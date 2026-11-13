# Maintenance API containers

See the [root README](../README.md) for the complete local stack, mail inbox,
configuration and optional demo accounts. The default Compose stack does not
require copying an `.env` file.

The Docker build context is this `server/` directory. Its allowlist excludes
local `.env` files, dependencies, test fixtures and local documentation. Supply
configuration at runtime; no credentials are build arguments or image inputs.

## Image targets

| Target    | Purpose                                                                               | Default command      |
| --------- | ------------------------------------------------------------------------------------- | -------------------- |
| `runtime` | Compiled Nest API on port 3000, Node 24, production dependencies, nonroot `node` user | `node dist/main.js`  |
| `migrate` | One-shot Drizzle migrations, with drizzle-kit and the checked-in SQL/config           | `npm run db:migrate` |

Build either image independently from the repository root:

```sh
docker build --target runtime -t mit8333-api ./server
docker build --target migrate -t mit8333-migrate ./server
```

Run the migrator after PostgreSQL is healthy and require its successful exit
before starting the API. It needs `DATABASE_URL` for that database. The runtime
needs the settings described in [.env.example](./.env.example); the root Compose
file supplies local container addresses and HTTP cookie settings automatically.

Compose selects `SMTP_STARTTLS=opportunistic` for its trusted Mailpit relay,
which does not offer STARTTLS. Outside this local stack, omit the setting to
retain the transport defaults: non-loopback SMTP hosts require STARTTLS, while
localhost development relays permit plaintext. `SMTP_STARTTLS=required` can
enforce STARTTLS explicitly. TLS certificate verification is unchanged.

Google client placeholders allow local email/password flows to run but cannot
complete real Google sign-in. Configure actual Google credentials at runtime
when that flow is needed; the callback must use the browser's public client URL.

The API already listens on all interfaces. The existing public
`GET /api/docs-json` endpoint returns `200` and can be probed with Node's built-in
`fetch` for container readiness; it is an HTTP check, not a database health probe.
Compose separately waits for PostgreSQL health and successful migrations.

No demo accounts are created automatically. When explicitly configured,
`npm run db:seed` is available in the runtime image after migrations; see the
root instructions for supplying the demo password and invoking it.

The seed also creates twelve demonstration Service Requests: one in every
Status for Student and Staff, with current work and Assignment history for the
officer and all requests visible to the Administrator. Reruns preserve existing
demo requests and their history; a private unique seed key prevents duplicates.

## Closing Service Requests

Requester and Administrator verification, Requester Not fixed answers, cancellation,
partial detail edits and Administrator Priority changes return the updated request
with `200`. Invalid Status transitions return `409`; Cancel and Not fixed require
a trimmed reason of 3–1,000 characters. Requesters can edit all details while
Submitted, and Administrators can correct category and location while Open.

The daily 03:00 job verifies Completed requests unanswered for at least seven
days, including when their Requester has left; the Status Update and Activity Log
have no actor. A new completion after Not fixed starts a fresh seven-day deadline.

## Concurrency tests

`npm run test:postgres` runs the HTTP concurrency regressions against real
Postgres; PGlite serializes transactions and cannot reproduce these races.
Set `TEST_POSTGRES_URL` to a local test Postgres connection whose user can create
databases. Each suite creates a uniquely named database, applies the real
migrations, and drops only that database on exit. Existing databases are untouched.

For example, start a disposable Postgres separately from the application stack:

```sh
docker run --rm --name mit8333-test-postgres -e POSTGRES_PASSWORD=test -p 127.0.0.1:55433:5432 -d postgres:17-alpine
TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55433/postgres npm run test:postgres
docker stop mit8333-test-postgres
```

Ordinary `npm test` and `npm run test:e2e` continue to use their existing fixtures.
