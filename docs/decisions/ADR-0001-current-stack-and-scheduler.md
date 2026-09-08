# ADR-0001 — Continue the Existing TypeScript Modular Monolith

- **Status:** Accepted
- **Date:** 2026-08-02 (status confirmed 2026-08-03 when D1 closed)
- **Owners:** product and technical owner

## Context

The repository already contains a working Next.js App Router application,
TypeScript domain modules, Drizzle migrations, Auth.js, Zod validation,
PostgreSQL integration, tests, and a reconciliation poller. Earlier planning
material considered several stacks and a queue-based scheduler. At the time this
ADR was drafted, “Fable” was an open wording question: it might have meant Claude
tooling or an F#/Fable implementation requirement.

**That question is now closed. Decision D1 (2026-08-03): “Fable” meant Claude
tooling.** No F#/Fable implementation stack was ever intended, so nothing about
this decision is conditional on it.

## Decision

Continue the existing TypeScript modular monolith for the current web-app
build:

- Next.js App Router with React and TypeScript;
- PostgreSQL with Drizzle;
- Auth.js Google OAuth plus a strictly local-only seeded dev login;
- server-side Zod validation and resource-scoped authorization;
- database-backed reconciliation poller for cycle transitions and scheduled
  publication.

Do not add pg-boss, Redis, a message broker, microservices, or a second API
layer for the first UI slices.

## Alternatives considered

- F#/Fable or SAFE-stack: **rejected.** D1 closed on 2026-08-03 — “Fable”
  referred to Claude tooling, not an implementation stack. No F# option is
  planned; the alternative is retained in
  [architecture-history.md](../architecture-history.md) §3.2 for the record.
- NestJS plus a separate React API/frontend: more operational and codebase
  complexity than this pilot requires.
- pg-boss or another queue: possible later if workload, retry visibility, or
  latency justifies it.

## Consequences

The first implementation can build on existing routes and domain services
without a migration or infrastructure rewrite. The poller remains simple and
retry-safe, but deployment must provide a reliable process or authenticated
cron. A future queue decision should be evidence-driven.

## Follow-up

- **None outstanding on the stack.** The “Fable” question is closed (D1) and the
  ORM question is closed (D11, Drizzle). No owner sign-off is pending, and no
  pause is required before expanding the TypeScript implementation.
- **Scheduler:** revisit only after pilot workload or failure evidence
  demonstrates a need — a queue remains an evidence-driven future decision, not
  an open one.
