# Class Feedback Platform

A centralized web platform for recurring weekly class feedback — replaces a
Google Forms + manually-compiled answer-document workflow. Students submit one
weekly form per class section; teachers review, respond privately, publish
anonymous Q&A to the class, track participation, and manage a course-level
question backlog.

Product/architecture documentation lives in [docs/](docs/) and
[AGENTS.md](AGENTS.md). This README covers running the implementation.

## Stack

TypeScript · Next.js (App Router) · PostgreSQL · Drizzle ORM · Auth.js
(Google) · Zod · Docker Compose · Vitest. Modular monolith — modules under
[src/modules/](src/modules/) match the documented domains (identity &
matching, catalog, forms, review, publishing, backlog & import, participation
& export, audit, scheduling).

## Local setup

Prerequisites: Node 20+, Docker.

```bash
npm install
cp .env.example .env          # then edit — see below
docker compose up -d          # Postgres on :5432 (dev) and :5433 (tests)
npm run db:migrate            # apply migrations to the dev DB
TEST_DATABASE_URL= npm run db:migrate  # optional: see "Tests" for the test DB
npm run db:seed               # demo course/section/roster/schedule + users
npm run dev                   # app on http://localhost:3000
npm run scheduler:dev         # (separate terminal) reconciliation poller
```

Migrate the test database once before running integration tests:

```bash
DATABASE_URL=postgres://feedback:feedback@localhost:5433/feedback_test npm run db:migrate
```

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `TEST_DATABASE_URL` | Separate DB used only by integration tests |
| `AUTH_SECRET` | Auth.js session secret (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (redirect URI `http://localhost:3000/api/auth/callback/google`). If unset, Google sign-in is unavailable but the app still runs. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated university domains allowed to sign in |
| `INSTITUTION_TIMEZONE` | Single institution timezone (default `Asia/Manila`) |
| `SCHEDULER_SECRET` | Shared secret for `POST /api/internal/scheduler/tick` |
| `DEV_AUTH_ENABLED` | **Local development only.** See warning below. |

### Dev login (local development ONLY)

With `DEV_AUTH_ENABLED=true` and a non-production `NODE_ENV`, the sign-in page
shows a "dev login" that signs in an existing user by email (no password) so
the app can be exercised without Google OAuth credentials. It is **disabled by
default**, **never creates users**, and is **impossible to enable in
production** — the provider is not registered when `NODE_ENV=production`
regardless of environment variables. Do not deploy with it in mind.

Seeded users: `teacher@up.edu.ph` (teacher), `sa@up.edu.ph` (SA with limited flags),
`admin@up.edu.ph` (platform admin), `student@up.edu.ph` (unverified student named
Juan Dela Cruz — confirm on the teacher's Matches page).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:generate` | Generate SQL migration from Drizzle schema |
| `npm run db:reset -- --yes` | **Destructively** reset the local dev DB, migrate, and reseed |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Idempotent demo seed |
| `npm run scheduler:dev` | Reconciliation poller loop (60 s) |
| `npm test` | Unit tests (pure logic, no DB) |
| `npm run test:integration` | Integration tests (needs the `db-test` container) |

## Scheduling model

DB-backed, poller-only for this phase: `reconcile()`
([src/modules/scheduling/index.ts](src/modules/scheduling/index.ts)) generates
cycles from recurrence schedules (unique `(schedule, cycle_index)` constraint
→ idempotent), opens/closes cycles past their times (state-guarded
transitions; late actions audit-flagged), and publishes due scheduled public
answers (failures flag the answer, staff retry). Run it via
`npm run scheduler:dev` or an external cron hitting
`POST /api/internal/scheduler/tick` with header `x-scheduler-secret`.

## Provisional decisions in this implementation

Marked **provisional** pending owner sign-off (see
[docs/open-decisions.md](docs/open-decisions.md)):

- **D2** teacher-confirm-all account matching (docs' recommended default; no auto-confirm path exists).
- **D3** platform admin grants the Teacher role (`users.isTeacher`); teachers self-serve courses/sections.
- **D4** structural edit-lock after first submission (helper `cycleHasSubmissions`; full edit UI not built yet).
- **D5** hard deadline, no grace; staff reopen is audited.
- **D7** timezone `Asia/Manila` via `INSTITUTION_TIMEZONE` (owner-confirmed value).
- **D8** merge within one section, across cycles.
- **D10** roster re-import deactivates (never deletes) absent students.
- **Scheduler**: reconciliation poller instead of pg-boss for this pass.

## Remaining work (not in this foundation pass)

pg-boss job queue (docs' recommended queue; the poller meets the same
idempotency requirements meanwhile) · richer template/cycle editing UI +
enforced edit-lock flow · backlog management UI (services exist) ·
Playwright e2e · notifications, AI features, unpublish, course-material
management (post-MVP by scope).
