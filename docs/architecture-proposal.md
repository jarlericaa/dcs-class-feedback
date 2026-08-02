# Architecture Proposal

> **Status:** Architecture rationale and future-options document. The current
> implementation baseline is documented in [ARCHITECTURE.md](ARCHITECTURE.md).
> Recommendations here do not silently become product requirements. See
> [SPEC-RECONCILIATION.md](SPEC-RECONCILIATION.md) for stale planning assumptions.
> Label key as in [product-requirements.md](product-requirements.md).

## 0. "Fable" caveat — read first

The owner mentioned "using Fable." This planning work does **not** assume that means the F#/[Fable](https://fable.io) compiler stack.

- If **"Fable" = the Claude Fable model/tooling only**, the TypeScript recommendation below stands as the *current recommended web stack*.
- If **"Fable" = a desired F#/Fable implementation stack**, the recommendation must change to (or add) an F# option (e.g. F# + Fable/Feliz frontend + a .NET/F# backend, SAFE-stack style).

The repository is already implemented in TypeScript. If “Fable” means an
F#/Fable implementation stack, pause and resolve [Open D1](open-decisions.md)
before expanding the UI; otherwise, continue with the current TypeScript
baseline.

## 1. Architectural style **[Recommended]**

**Modular monolith** on **PostgreSQL**. One deployable app, internally split into modules with explicit boundaries. This fits a student-development team: simple to run, test, and deploy, while keeping seams that could later split out if ever needed.

**Explicitly avoided** (per [mvp-scope.md](mvp-scope.md)): microservices, message brokers, separate databases, event-driven infrastructure, dedicated vector databases, standalone AI services.

### 1.1 Module map **[Recommended]**

| Module | Responsibility | Key docs |
|--------|----------------|----------|
| **identity & matching** | SSO, users, roster, name matching, enrollment | [account-matching.md](account-matching.md) |
| **catalog** | courses, sections, staff, permissions, lessons/topics | [roles-and-permissions.md](roles-and-permissions.md) |
| **forms** | templates, recurrence, cycles, questions, responses | [weekly-form-workflow.md](weekly-form-workflow.md) |
| **review & publishing** | dashboard, private/public responses, rewording, merge, scheduling, archive | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| **backlog & import** | course backlog, legacy import | [question-backlog.md](question-backlog.md), [legacy-question-import.md](legacy-question-import.md) |
| **participation & export** | derived participation, CSV exports | [participation-rules.md](participation-rules.md) |
| **audit** | append-only audit events | [domain-model.md](domain-model.md#audit-events) |

## 2. Stack comparison and current baseline

TypeScript end-to-end:

| Concern | Primary pick | Why |
|---------|-------------|-----|
| Web framework | **Next.js (App Router)** | One codebase for UI + server; strong TS support; good Claude Code familiarity. |
| Language | **TypeScript** | Type safety across UI, server, and data layer. |
| Database | **PostgreSQL** | [Confirmed] target; relational fit for this model; strong constraints for the uniqueness/idempotency rules. |
| ORM / data layer | **Drizzle ORM** (single primary pick) | SQL-transparent, lightweight, easy for a student team to learn relational modeling; typed queries. |
| Auth | **Auth.js (Google provider)** | Google OAuth support with minimal glue; restrict to university domain. |
| Job scheduling | **Reconciliation poller [Implemented]** | Current repository mechanism for cycle transitions and due publication; a queue can be evaluated later. |
| Validation | **Zod** | Shared client/server schemas; server-side validation is authoritative. |
| Dev environment | **Docker Compose** | App + Postgres locally; reproducible. |
| Migrations | Drizzle migrations **[Implemented]** | Versioned schema under `drizzle/`. |
| Testing | **Vitest** (unit/integration) + **Playwright** (e2e) | Covers the name-matching pipeline, authz, scheduling idempotency, exports. |

> **ORM note:** Drizzle is the single primary recommendation. **Prisma is the main alternative** — see §3.1. Do not leave this unresolved in code: if the owner prefers Prisma, that is [Open D11](open-decisions.md).

## 3. Alternatives & trade-offs **[Recommended]**

Evaluated against the owner's criteria: learning curve, maintainability, type safety, PostgreSQL support, auth support, dynamic-form needs, scheduled jobs, testing, deployment simplicity, future AI integration, Claude Code suitability.

### 3.1 Prisma vs Drizzle (the ORM decision)

| | Drizzle (recommended) | Prisma (alternative) |
|--|----------------------|----------------------|
| Learning curve | Closer to SQL; small surface | Higher-level; very approachable API |
| Type safety | Strong, inferred from schema | Strong, generated client |
| SQL transparency | High (you see the SQL) | Lower (abstracted) |
| Migrations | Lightweight | Mature, batteries-included |
| Fit for students learning DBs | Teaches SQL concepts | Hides SQL; faster start |
| Verdict | **Primary** — SQL transparency aids debugging the constraint/idempotency rules | Reasonable if the team prefers a higher-level API ([Open D11](open-decisions.md)) |

### 3.2 Other stacks

| Stack | Pros | Cons | Verdict |
|-------|------|------|---------|
| **SvelteKit + Drizzle** | Lean, fast, TS | Smaller ecosystem; less Claude Code training mass | Viable TS alternative |
| **NestJS API + React SPA** | Clear layering, strong DI | Two codebases; more ceremony for a student team | Heavier than needed |
| **Django + HTMX** | Batteries included, admin, mature | Not TS (weaker end-to-end type safety); pivots away from owner's type-safe preference | Non-TS baseline for comparison |
| **F# + Fable / SAFE-stack** | Applies **if** D1 resolves to F#/Fable | Steeper learning curve; smaller hiring/help pool | Contingent on [Open D1](open-decisions.md) |

## 4. Scheduling design **[Recommended]** {#scheduling}

Two scheduled concerns share one DB-backed mechanism: **weekly-cycle open/close** ([weekly-form-workflow.md](weekly-form-workflow.md#2-cycle-generation--auto-open)) and **public-answer publication** ([public-qa-and-source-linking.md](public-qa-and-source-linking.md#7-scheduled-public-answers)).

Requirements this design must meet:

- **Idempotent cycle generation** — unique constraint on `(section, cycle window/index)`; generation re-runnable with no duplicates.
- **Idempotent scheduled publication** — one job per `PublicAnswer` keyed uniquely; the job re-checks current state before acting, so retries/replays never double-publish.
- **Duplicate-prevention constraints** — enforced in the database, not only in application code.
- **Scheduler-down behavior / reconciliation** — a poller runs on startup and periodically: opens cycles past `open-at` still `Scheduled`; closes cycles past deadline still `Open`; publishes `Scheduled` answers past `scheduled-at`. Late actions are flagged **late** in the audit log.
- **Failed-publication recovery** — a failed publish leaves the answer `Scheduled` with a failure flag/reason, surfaced in-app (no notifications in MVP) with retry/resolve actions for staff.

The reconciliation poller is the current scheduler. A queue such as pg-boss may
provide more granular retries later, but it is not part of the current
dependency set and is not required for the first usable release.

## 5. Authorization enforcement **[Recommended]** {#authorization}

Implements the deny-by-default, resource-scoped model in [roles-and-permissions.md](roles-and-permissions.md):

- A single authorization layer resolves `(actor, action, resource)` → allow/deny by looking up `CourseStaff`/`SectionStaff` membership and permission flags on the specific resource.
- No route exposes a resource without passing this check; teachers get no ambient access to unrelated courses/sections (Risk R5).
- Student-visibility projections (what a student may read) are enforced server-side, not just hidden in the UI (Risk R6).

## 6. Audit implementation **[Recommended]** {#audit}

- An **append-only** `AuditEvent` store capturing actor, action, timestamp, affected entity, and before/after values ([domain-model.md](domain-model.md#audit-events)).
- Writes happen in the same transaction as the audited change where feasible, so an action and its audit record commit together.
- Audit is readable only by authorized staff/admins.

## 7. CSV import/export **[Recommended]**

- **Import** (roster + legacy): validate → map columns → detect duplicates → preview → per-row errors → summary → audited `ImportBatch`; never silently overwrite ([account-matching.md](account-matching.md#9-class-list-csv-import), [legacy-question-import.md](legacy-question-import.md)).
- **Export** (participation): the three reports in [participation-rules.md](participation-rules.md#4-participation-csv-exports); identity-bearing, staff-only, access audited; emit stable ids alongside labels.

## 8. Dev environment & deployment **[Recommended]**

- **Docker Compose** for local dev (app + Postgres). Migrations run against the containerized DB.
- **Deployment options:** a single container + managed Postgres (simplest); or a PaaS that runs the Next.js app with a managed Postgres add-on. Choice deferred; both keep the monolith simple. This is not decided ([Open D12](open-decisions.md)).

## 9. Testing strategy **[Recommended]**

Priority coverage: the name-matching pipeline (deterministic, unit-tested with adversarial name cases); authorization (resource-scoping and student-visibility); scheduling idempotency + reconciliation; participation derivation and export correctness (labels + stable ids); the one-submission-per-cycle constraint.

## 10. Open decisions affecting architecture

- [Open D1] "Fable" meaning → blocks only if F#/Fable is intended.
- [Open D11] ORM (Drizzle vs Prisma) if the team wants to replace the already-implemented Drizzle baseline.
- [Open D12] Deployment target.

See [open-decisions.md](open-decisions.md).

## 11. Related documents

[domain-model.md](domain-model.md) · [roles-and-permissions.md](roles-and-permissions.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [participation-rules.md](participation-rules.md) · [ai-future-plan.md](ai-future-plan.md) · [open-decisions.md](open-decisions.md)
