# Architecture History

> ## Historical record — the options that were weighed, not a pending decision
>
> **Status:** the architecture *rationale* behind choices that have since been
> made, kept for the alternatives it weighed and the reasons it rejected them.
> **The architecture question is settled.** Read
> [ARCHITECTURE.md](ARCHITECTURE.md) for what actually runs and
> [ADR-0001](decisions/ADR-0001-current-stack-and-scheduler.md) for the accepted
> decision.
>
> **Approved baseline (D1 closed 2026-08-03, D11 closed 2026-08-03):** a
> TypeScript modular monolith — **Next.js (App Router)**, **PostgreSQL**,
> **Drizzle**, **Auth.js** (Google), **Zod**, with a **database-backed
> reconciliation poller** for cycle transitions and scheduled publication. No
> `pg-boss`, no Redis, no broker.
>
> Every alternative below — F#/Fable, Prisma, SvelteKit, NestJS, Django — is
> retained as a **rejected historical option**, not an open choice. Nothing here
> requires a decision before work continues.
>
> Most sections below describe mechanisms that were adopted and built, and are
> labelled **[Implemented]** — scheduling, authorization, audit and CSV export
> all ship today. What genuinely remains open keeps **[Recommended]**: the
> deployment shape (§8), browser-test depth (§9), and any future job
> abstraction. Recommendations never silently become product requirements. Label key as in
> [product-requirements.md](product-requirements.md); stale planning assumptions
> are tracked in [SPEC-RECONCILIATION.md](SPEC-RECONCILIATION.md).

## 0. The "Fable" question — closed

**Resolved. Recorded here because this document was written while it was open.**

The owner had mentioned "using Fable", and it was unclear whether that meant the
Claude Fable model/tooling or the F#/[Fable](https://fable.io) compiler stack.
The distinction mattered: the second reading would have required an F# option
(Fable/Feliz frontend, .NET/F# backend, SAFE-stack style) instead of the
TypeScript one proposed below.

**D1 closed 2026-08-03: it meant Claude tooling.** The TypeScript baseline is
approved and implemented ([open-decisions.md](open-decisions.md),
[ADR-0001](decisions/ADR-0001-current-stack-and-scheduler.md)). No F#/Fable stack
is planned, and no reader needs to resolve anything before starting work.

## 1. Architectural style **[Implemented]**

**Modular monolith** on **PostgreSQL** — proposed here, adopted, and now running
([ARCHITECTURE.md](ARCHITECTURE.md)). One deployable app, internally split into modules with explicit boundaries. This fits a student-development team: simple to run, test, and deploy, while keeping seams that could later split out if ever needed.

**Explicitly avoided** (per [mvp-scope.md](mvp-scope.md)): microservices, message brokers, separate databases, event-driven infrastructure, dedicated vector databases, standalone AI services.

### 1.1 Module map **[Implemented]**

The modules below exist under `src/modules/`; [ARCHITECTURE.md](ARCHITECTURE.md) owns the current boundaries.

| Module | Responsibility | Key docs |
|--------|----------------|----------|
| **identity** | SSO, users, roster, email-based student resolution, enrollment | [student-identity.md](student-identity.md) |
| **catalog** | courses, sections, staff, permissions, lessons/topics | [roles-and-permissions.md](roles-and-permissions.md) |
| **forms** | templates, recurrence, cycles, questions, responses | [weekly-form-workflow.md](weekly-form-workflow.md) |
| **review & publishing** | dashboard, private/public responses, rewording, merge, scheduling, archive | [public-qa-and-source-linking.md](public-qa-and-source-linking.md) |
| **backlog & import** | course backlog, legacy import | [question-backlog.md](question-backlog.md), [legacy-question-import.md](legacy-question-import.md) |
| **participation & export** | derived participation, CSV exports | [participation-rules.md](participation-rules.md) |
| **audit** | append-only audit events | [domain-model.md](domain-model.md#audit-events) |

## 2. Stack comparison and current baseline **[Implemented]**

The table below is the **adopted** stack, not a shortlist — every row was chosen
and built. TypeScript end-to-end:

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
| Testing | **Vitest** (unit/integration) + **Playwright** (e2e) | Covers email normalization and roster import rules, authz, scheduling idempotency, exports. |

> **ORM note:** Drizzle is the chosen ORM — **D11 closed 2026-08-03** and Drizzle is the repository's migration source of truth. Prisma remains the documented alternative in §3.1 for the record; swapping to it would be a deliberate replacement decision, not an open question.

## 3. Alternatives & trade-offs — historical

**None of these is an open choice.** They record what was weighed before the
baseline in §2 was adopted, and why each was rejected. Reopening any of them
would be a new decision with a migration cost, not a resumption of this one.

Evaluated against the owner's criteria: learning curve, maintainability, type safety, PostgreSQL support, auth support, dynamic-form needs, scheduled jobs, testing, deployment simplicity, future AI integration, Claude Code suitability.

### 3.1 Prisma vs Drizzle (the ORM decision)

| | Drizzle (recommended) | Prisma (alternative) |
|--|----------------------|----------------------|
| Learning curve | Closer to SQL; small surface | Higher-level; very approachable API |
| Type safety | Strong, inferred from schema | Strong, generated client |
| SQL transparency | High (you see the SQL) | Lower (abstracted) |
| Migrations | Lightweight | Mature, batteries-included |
| Fit for students learning DBs | Teaches SQL concepts | Hides SQL; faster start |
| Verdict | **Chosen** (D11, closed 2026-08-03) — SQL transparency aids debugging the constraint/idempotency rules | Reasonable alternative, not selected; replacing Drizzle would be a new decision |

### 3.2 Other stacks

| Stack | Pros | Cons | Verdict |
|-------|------|------|---------|
| **SvelteKit + Drizzle** | Lean, fast, TS | Smaller ecosystem; less Claude Code training mass | Viable TS alternative |
| **NestJS API + React SPA** | Clear layering, strong DI | Two codebases; more ceremony for a student team | Heavier than needed |
| **Django + HTMX** | Batteries included, admin, mature | Not TS (weaker end-to-end type safety); pivots away from owner's type-safe preference | Non-TS baseline for comparison |
| **F# + Fable / SAFE-stack** | Would have applied had D1 resolved to F#/Fable | Steeper learning curve; smaller hiring/help pool | **Not selected** — D1 closed 2026-08-03 on the TypeScript baseline ([open-decisions.md](open-decisions.md)) |

<a id="scheduling"></a>

## 4. Scheduling design **[Implemented]**

Two scheduled concerns share one DB-backed mechanism: **weekly-cycle open/close** ([weekly-form-workflow.md](weekly-form-workflow.md#2-instance-generation--auto-open)) and **public-answer publication** ([public-qa-and-source-linking.md](public-qa-and-source-linking.md#7-scheduled-public-answers)).

Requirements this design must meet:

- **Idempotent cycle generation** — unique constraint on `(section, cycle window/index)`; generation re-runnable with no duplicates.
- **Idempotent scheduled publication** — one job per `PublicAnswer` keyed uniquely; the job re-checks current state before acting, so retries/replays never double-publish.
- **Duplicate-prevention constraints** — enforced in the database, not only in application code.
- **Scheduler-down behavior / reconciliation** — a poller runs on startup and periodically: opens cycles past `open-at` still `Scheduled`; closes cycles past deadline still `Open`; publishes `Scheduled` answers past `scheduled-at`. Late actions are flagged **late** in the audit log.
- **Failed-publication recovery** — a failed publish leaves the answer `Scheduled` with a failure flag/reason, surfaced in-app with retry/resolve actions for staff. Email notifications (`F1`) are approved and built for form-opened, deadline reminders and validity changes, but **no publication-failure notification exists**, so in-app remains the only channel here.

The reconciliation poller is the current scheduler. A queue such as pg-boss may
provide more granular retries later, but it is not part of the current
dependency set and is not required for the first usable release.

<a id="authorization"></a>

## 5. Authorization enforcement **[Implemented]**

Implements the deny-by-default, resource-scoped model in [roles-and-permissions.md](roles-and-permissions.md):

- A single authorization layer resolves `(actor, action, resource)` → allow/deny by looking up `CourseStaff`/`SectionStaff` membership and permission flags on the specific resource.
- No route exposes a resource without passing this check; teachers get no ambient access to unrelated courses/sections (Risk R5).
- Student-visibility projections (what a student may read) are enforced server-side, not just hidden in the UI (Risk R6).

<a id="audit"></a>

## 6. Audit implementation **[Implemented]**

- An **append-only** `AuditEvent` store capturing actor, action, timestamp, affected entity, and before/after values ([domain-model.md](domain-model.md#audit-events)).
- Writes happen in the same transaction as the audited change where feasible, so an action and its audit record commit together.
- Audit is readable only by authorized staff/admins.

## 7. CSV import/export **[Implemented]**

- **Import** (roster + legacy): validate → map columns → detect duplicates → preview → per-row errors → summary → audited `ImportBatch`; never silently overwrite ([student-identity.md](student-identity.md#7-class-list-import-confirmed-project-specsmd-61), [legacy-question-import.md](legacy-question-import.md)).
- **Export** (participation): the three reports in [participation-rules.md](participation-rules.md#4-participation-csv-exports); identity-bearing, staff-only, access audited; emit stable ids alongside labels.

## 8. Dev environment & deployment **[Recommended]**

- **Docker Compose** for local dev (app + Postgres). Migrations run against the containerized DB.
- **Deployment options:** a single container + managed Postgres (simplest); or a PaaS that runs the Next.js app with a managed Postgres add-on. Choice deferred; both keep the monolith simple. This is not decided ([Open D12](open-decisions.md)).

## 9. Testing strategy **[Implemented]** / **[Recommended]**

**[Implemented]:** Vitest unit and PostgreSQL integration suites cover the
priority areas below. **[Recommended], still absent:** the Playwright browser
suite — [CURRENT_STATE.md](CURRENT_STATE.md) records the E2E suite as `missing`,
with `scripts/verify/http-matrix.sh` as the only end-to-end check today.
[TESTING.md](TESTING.md) owns the current layers and counts.

Priority coverage: email normalization and the class-list import rules (deterministic, unit-tested; identical names must never cross-resolve); authorization (resource-scoping and student-visibility); scheduling idempotency + reconciliation; participation derivation and export correctness (labels + stable ids); the one-submission-per-cycle constraint.

## 10. Decisions affecting architecture

- [D1] "Fable" meaning — **closed 2026-08-03**: Claude tooling, TypeScript baseline approved.
- [D11] ORM — **closed 2026-08-03**: Drizzle. Reopen only to deliberately replace the implemented baseline, not to start UI work.
- [Open D12] Deployment target.

See [open-decisions.md](open-decisions.md).

## 11. Related documents

[domain-model.md](domain-model.md) · [roles-and-permissions.md](roles-and-permissions.md) · [weekly-form-workflow.md](weekly-form-workflow.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [participation-rules.md](participation-rules.md) · [ai-future-plan.md](ai-future-plan.md) · [open-decisions.md](open-decisions.md)
