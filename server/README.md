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
