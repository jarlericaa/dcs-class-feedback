# ADR-0001 — Continue the Existing TypeScript Modular Monolith

- **Status:** Accepted / provisional
- **Date:** 2026-08-02
- **Owners:** product and technical owner

## Context

The repository already contains a working Next.js App Router application,
TypeScript domain modules, Drizzle migrations, Auth.js, Zod validation,
PostgreSQL integration, tests, and a reconciliation poller. Earlier planning
material considered several stacks and a queue-based scheduler. “Fable” remains
an open wording question: it may refer to Claude tooling or to an F#/Fable
implementation requirement.

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

- F#/Fable or SAFE-stack: only if the owner confirms that “Fable” means the
  implementation stack.
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

Resolve the “Fable” meaning before a major TypeScript expansion if the owner
intended F#/Fable. Revisit the scheduler only after pilot workload or failure
evidence demonstrates a need.
