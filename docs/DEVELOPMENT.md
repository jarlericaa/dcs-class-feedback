# Development Guide

## Prerequisites

- Node.js 20 or newer.
- Docker and Docker Compose.
- A PostgreSQL client is optional but useful for inspection.

## Local setup

```bash
npm ci
cp .env.example .env
# Edit .env; see the variable table below.
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Run the scheduler in a second terminal when testing cycle transitions or
scheduled publication:

```bash
npm run scheduler:dev
```

The application runs at `http://localhost:3000`.

## Test database

The Compose file exposes a separate PostgreSQL database for integration tests.
Apply the migration once before running them:

```bash
DATABASE_URL=postgres://feedback:feedback@localhost:5433/feedback_test npm run db:migrate
```

Then run:

```bash
npm test
npm run test:integration
```

## Environment variables

The complete development contract is in `.env.example`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Development PostgreSQL connection |
| `TEST_DATABASE_URL` | Integration-test PostgreSQL connection |
| `AUTH_SECRET` | Auth.js session secret |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated allowed university domains |
| `INSTITUTION_TIMEZONE` | Default scheduling timezone; current default is `Asia/Manila` |
| `SCHEDULER_SECRET` | Secret for the internal scheduler endpoint |
| `DEV_AUTH_ENABLED` | Local-only seeded-user login toggle |

Google OAuth callback for local development:

```text
http://localhost:3000/api/auth/callback/google
```

`DEV_AUTH_ENABLED` must never be used as a production authentication path. The
provider is disabled when `NODE_ENV=production`.

## Seeded development accounts

The seed script creates demo users for the local workflow, including teacher,
TA, platform-admin, and an unverified student account. Use the exact values in
the seed script/README rather than copying credentials into documentation.

## Project commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:reset -- --yes` | **Destructively** reset the local dev DB, migrate, and reseed |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Insert idempotent demo data |
| `npm run scheduler:dev` | Run the reconciliation poller |
| `npm test` | Run unit tests |
| `npm run test:integration` | Run database integration tests |

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For changes touching PostgreSQL, authz, scheduling, roster matching, or
student-visible data, also run the relevant integration tests and update the
documentation listed in [DOCUMENT_MANIFEST.yaml](DOCUMENT_MANIFEST.yaml).

## Troubleshooting

### The app renders as unstyled HTML

The stylesheet 404s and every page falls back to browser defaults. This
happens after running `npm run build` and then `npm run dev` in the same
checkout: both write to `.next`, and the dev server serves a CSS asset path
that the production build left behind.

```bash
rm -rf .next
npm run dev
```

Then hard-reload the browser (`Ctrl`/`Cmd` + `Shift` + `R`) — the 404 response
is usually cached. Confirm the fix by checking that the stylesheet resolves:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:3000$(curl -s http://localhost:3000/signin \
   | grep -oE '/_next/static/css/[^"?]*' | head -1)"   # expect 200
```

### Nothing appears on the dashboard after signing in

An account only sees sections it is enrolled in or staffs, and a student
account stays empty until a teacher confirms its roster match on
`/teach/sections/[id]/matches`. This is the intended teacher-confirm-all
behaviour, not a bug — see [account-matching.md](account-matching.md).

### The weekly form says no cycle is open

Cycles open and close through the reconciliation poller. Run it alongside the
dev server, or re-run the seed which reconciles once:

```bash
npm run scheduler:dev
```

## Development rules

- Keep business rules in `src/modules/`, not in page components.
- Re-check authorization in every server action and route handler.
- Treat `src/db/schema/` and migrations as implementation truth.
- Never use `.env` values or student data in committed docs, screenshots, or
  tests.
- Add tests for state transitions, authorization boundaries, and duplicate or
  retry behavior before adding UI shortcuts.
