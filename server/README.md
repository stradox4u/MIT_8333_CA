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
New demo requests include a Progress Note before work begins.

## Closing Service Requests

Requester and Administrator verification, Requester Not fixed answers, cancellation,
partial detail edits and Administrator Priority changes return the updated request
with `200`. Invalid Status transitions return `409`; Cancel and Not fixed require
a trimmed reason of 3–1,000 characters. Requesters can edit all details while
Submitted, and Administrators can correct category and location while Open.

The daily 03:00 job verifies Completed requests unanswered for at least seven
days, including when their Requester has left; the Status Update and Activity Log
have no actor. A new completion after Not fixed starts a fresh seven-day deadline.

## Progress Notes

`POST /api/service-requests/:reference/progress-notes` accepts `{ text }` and
returns the updated request with `201`. The Requester, current Maintenance Officer
and Administrators can append while Open or Completed; former officers remain
read-only unless they also have Requester or Administrator rights. Text is trimmed
and must contain 1–2,000 characters. Notes cannot be edited or deleted and change
neither Status nor the Activity Log; they send no email.

Every viewer sees notes in the oldest-first timeline as
`{ type: "progress_note", occurredAt, actor: { id, name }, text }`. Erased authors
show as "Erased user". Migration `0014_progress_notes` adds the table, foreign keys
and request index, using the existing shared timeline sequence for timestamp ties.
Run migrations before deploying the API. The client currently ignores this new
variant safely; displaying and composing notes belongs to client slice 4.

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

## Search, filters and dashboard counts

`GET /api/service-requests` requires `scope=requested|assigned|all` and returns
`{ items, page, pageSize, total }`. `total` counts all matching requests in that
scope before pagination, including when the requested page is empty. Defaults
are `page=1`, `pageSize=20` (maximum 100) and `sort=newest`.

All scopes accept `search` and `status`. Search trims whitespace, accepts up to
200 characters and matches a case-insensitive literal substring of Reference or
title; `%`, `_` and backslashes have no special meaning. Empty search has no
effect. Status accepts `submitted`, `assigned`, `in_progress`, `completed`,
`verified`, `cancelled`, or `open` (Submitted, Assigned and In Progress).

Administrators using `scope=all` also search location and the Requester's display
name, including "Erased user". This scope accepts `category` (one of the six
category IDs), `priority=low|normal|high|urgent`, `officerId` (current officer UUID),
`submittedFrom`, `submittedTo` and `sort=priority`. Submitted boundaries are
inclusive UTC days in `YYYY-MM-DD` format, years 0001–9999; either boundary can
stand alone. Filters combine with AND. Unknown keys, repeated values, malformed
values, reversed dates and filters unsupported by the scope return `400`.

`newest` orders Submitted time descending, then internal ID descending.
`priority` orders Urgent, High, Normal, Low, then Submitted time ascending (longest
waiting first), then ID ascending. IDs break timestamp ties for stable pages.

The officer dashboard uses the constrained exception
`scope=assigned&officerId=<own UUID>&status=open&sort=priority`: the own-officer
filter restricts results to current Assignments, where Priority is visible.
Another officer's UUID is forbidden (`403`); Priority ordering without this
current-assignment restriction is invalid (`400`). Ordinary `scope=assigned`
continues to include every request the officer has ever held, newest first.
`scope=requested` accepts only search, Status, newest ordering and pagination.
Existing Role checks and per-row Priority redaction apply to every list.

`GET /api/service-requests/summary?scope=...` uses the same scope permissions and
accepts no list filters. It returns `{ byStatus: { submitted, assigned,
in_progress, completed, verified, cancelled } }`, with zero for absent Statuses.
Administrators also receive `openByCategory: [{ category: { id, name, code },
count }]`, with all six categories in display order, including zeros. These
counts cover Open requests in the selected scope; an Administrator's requested
summary never counts other Requesters' requests. Historical Assignments count a
request once. This slice needs no migration, new configuration or dependency.
