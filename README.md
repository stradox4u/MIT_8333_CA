# MIT 8333 University maintenance portal

Shared terminology for the client and server is defined in the
[domain glossary](GLOSSARY.md).

## Run the whole application locally

Copy `server/.env.example` to `server/.env` and set the five required S3 values
for your private bucket, including `S3_KEY_PREFIX=dev/`. Production uses its own
configured prefix, for example `prod/`; the API never chooses it from `NODE_ENV`.
See [photo storage setup](server/README.md#photos) for bucket access and CORS.
With Docker Desktop running, run these commands from the repository root:

```sh
docker compose --env-file server/.env build
docker compose --env-file server/.env up
```

Compose starts the Vue client with Vite, builds the Nest API, starts Postgres and
Mailpit, and applies database migrations before starting the API. Vite provides
hot reload, a same-origin `/api` proxy and SPA route fallback.
No host Node.js installation or external mail/database account is needed.

| Service                                    | Local address                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Application                                | http://localhost:5173                                                          |
| Email inbox (Mailpit)                      | http://localhost:8025                                                          |
| API documentation through the client proxy | http://localhost:5173/api/docs                                                 |
| Postgres for host tools                    | `localhost:5432` (database/user/password: `mit8333` / `postgres` / `postgres`) |
| SMTP for host tools                        | `localhost:1025`                                                               |

Open the application, choose **Sign up**, and enter an email address. Find its
Sign-in Link in Mailpit, follow it, choose **Continue signing in**, then finish
signing up. Mailpit captures messages locally; these emails do not leave your
machine. Use `localhost` consistently because the API trusts the configured
application origin.

```sh
docker compose ps
docker compose logs -f server
docker compose down
```

Postgres data survives normal shutdowns in the `mit8333_postgres-data` volume.
`docker compose down --volumes` also deletes that local database. Existing
volumes from the former `server/docker-compose.yml` are not moved or removed.
Client source files are mounted into the Vite container. Save a Vue, TypeScript
or CSS file and the browser updates automatically; no rebuild or restart is
needed. File watching uses polling for Docker Desktop compatibility.

After changing client dependencies, rebuild just the client and refresh its
isolated dependency volume:

```sh
docker compose --env-file server/.env up --build --no-deps --renew-anon-volumes -d client
```

The API still runs compiled code. After changing server code, rebuild just that
service with `docker compose --env-file server/.env up --build --no-deps -d server`.
Run migrations when making database schema changes.

The client Dockerfile is for local development. In production, Netlify builds
and serves `client/dist`; its generated `_redirects` rules proxy `/api/*` to the
server and provide the SPA fallback. See the [client deployment notes](client/README.md#netlify-and-railway).

## Optional Google sign-in and demo accounts

The default stack supports email links and passwords. Google requires your own
OAuth credentials. To reuse Google/demo values from the existing `server/.env`:

```sh
docker compose --env-file server/.env up --build -d
```

Compose uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`DEMO_ACCOUNTS_DOMAIN` and `DEMO_ACCOUNTS_PASSWORD` from that file. It keeps the
database and SMTP connections pointing at the local containers and sets
`APP_URL=http://localhost:5173`, `COOKIE_SECURE=false`, and one trusted proxy
for the local client proxy. `SMTP_STARTTLS=opportunistic` permits Mailpit's local SMTP
connection; the default SMTP security policy remains unchanged outside Compose.
It disables Observe telemetry for this stack. Existing `.env` files are neither
changed nor copied into images.

Register `http://localhost:5173/api/auth/oidc/google/callback` as an authorized
Google redirect URI. Without credentials, use email links; the local placeholder
credentials do not implement Google sign-in.

Migrations install the Roles but do not create demo accounts automatically. To
create the four demo accounts, first set `DEMO_ACCOUNTS_PASSWORD` to a password
that meets the application rules in `server/.env`, start with the command above,
then run:

```sh
docker compose exec server npm run db:seed
```

## Ports and other development options

Override `CLIENT_PORT`, `POSTGRES_PORT`, `MAILPIT_PORT` or `MAILPIT_SMTP_PORT`
when a default port is occupied. For example:

```sh
CLIENT_PORT=5180 MAILPIT_PORT=8026 docker compose --env-file server/.env up --build -d
```

The application origin and emailed links follow `CLIENT_PORT`. Update the
Google redirect URI to match if you use Google. Containers still connect using
their internal service names and ports. The API has no direct host port; access
it through the client proxy.

For host-based development and individual test commands, see the
[client README](client/README.md) and [server README](server/README.md).
Stop the Compose stack before starting host development servers or browser
fixtures on the same ports.
